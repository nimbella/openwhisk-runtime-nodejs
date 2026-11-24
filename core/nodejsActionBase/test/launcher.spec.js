/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements; see the NOTICE file distributed with this work.
 * Licensed under the Apache License, Version 2.0.
 */

// End-to-end test of the scriptBasedInit path (bin/compile + launcher.js), i.e. what runs when
// LOG_DESTINATIONS is set. Regression coverage for SERVERLESS-3979 ("type": "module").
//
// launcher.js hardcodes /nodejsAction/..., so each test compiles against a copy of the launcher whose
// absolute requires point at this checkout (via the OW_NODE_LAUNCHER override), then drives the generated
// `exec` over the ActionLoop protocol: fd 3 = ack/results, stdin = activation lines.
// Requires python3 and node on PATH. Uses node:assert only (no npm install needed beyond mocha).

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const BASE = path.resolve(__dirname, '..');
const COMPILE = path.join(BASE, 'bin', 'compile');
const FIXTURES = path.join(__dirname, 'fixtures', 'launcher');
const SENTINEL = 'XXX_THE_END_OF_A_WHISK_ACTIVATION_XXX';

let tmpRoot;
let launcherCopy;

before(function () {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-node-launcher-'));
    launcherCopy = path.join(tmpRoot, 'launcher.js');
    const src = fs.readFileSync(path.join(BASE, 'launcher.js'), 'utf8');
    fs.writeFileSync(launcherCopy, src.split("'/nodejsAction/").join("'" + BASE + '/'));
});

after(function () {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Copies a fixture to a fresh dir and runs bin/compile on it. */
function compile(fixture, main) {
    const dir = fs.mkdtempSync(path.join(tmpRoot, fixture + '-'));
    fs.cpSync(path.join(FIXTURES, fixture), dir, { recursive: true });
    const res = spawnSync('python3', [COMPILE, main, dir, dir], {
        env: { ...process.env, OW_NODE_LAUNCHER: launcherCopy },
        encoding: 'utf8',
    });
    return { dir, res };
}

/** Starts the compiled action; resolves lines read from fd 3 and the exit state. */
function start(dir) {
    const child = spawn('bash', [path.join(dir, 'exec')], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    const fd3 = [];
    const waiters = [];
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    readline.createInterface({ input: child.stdio[3] }).on('line', l => {
        fd3.push(l);
        waiters.splice(0).forEach(w => w());
    });
    const exited = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
    async function line(n, ms = 10000) {
        const deadline = Date.now() + ms;
        while (fd3.length <= n) {
            if (Date.now() > deadline) throw new Error(`timeout waiting for fd3 line ${n}; stderr=${stderr} stdout=${stdout}`);
            await new Promise(r => { waiters.push(r); setTimeout(r, 50); });
        }
        return fd3[n];
    }
    return { child, fd3, exited, line, out: () => ({ stdout, stderr }) };
}

async function runOnce(dir, value) {
    const a = start(dir);
    try {
        const ack = JSON.parse(await a.line(0));
        a.child.stdin.write(JSON.stringify({ value }) + '\n');
        const result = JSON.parse(await a.line(1));
        return { ack, result, ...a.out() };
    } finally {
        a.child.stdin.end();
        a.child.kill();
        await a.exited;
    }
}

describe('bin/compile', function () {
    it('emits exec__.cjs (never exec__.js) and an exec script that runs it', function () {
        const { dir, res } = compile('esm-type-module', 'main');
        assert.equal(res.status, 0, res.stderr);
        assert.ok(fs.existsSync(path.join(dir, 'exec__.cjs')));
        assert.ok(!fs.existsSync(path.join(dir, 'exec__.js')));
        assert.match(fs.readFileSync(path.join(dir, 'exec'), 'utf8'), /exec node exec__\.cjs/);
    });

    it('substitutes the main spec and leaves no placeholder behind', function () {
        const { dir } = compile('file-func', 'handler.run');
        const body = fs.readFileSync(path.join(dir, 'exec__.cjs'), 'utf8');
        assert.ok(body.includes("'handler.run'"));
        assert.ok(!body.includes('##MAIN'));
    });

    it('rejects a zip with neither package.json nor index.[m]js (single-part main)', function () {
        const { res } = compile('no-entrypoint', 'main');
        assert.equal(res.status, 1);
        assert.match(res.stdout, /package\.json or index\.\[m\]js/);
    });
});

describe('launcher.js on the scriptBasedInit path (LOG_DESTINATIONS)', function () {
    this.timeout(30000);

    const ok = [
        // name,                       main,                        note
        ['esm-type-module',            'main',                      '"type":"module" + index.js (SERVERLESS-3979)'],
        ['esm-package-main',           'main',                      '"type":"module" + package.json main'],
        ['esm-mjs-only',               'main',                      'index.mjs, no package.json'],
        ['cjs-index',                  'main',                      'CJS index.js (must not regress)'],
        ['cjs-package-main',           'main',                      'CJS via package.json main in subdir'],
        ['cjs-module-exports-object',  'main',                      'module.exports = { main }'],
        ['file-func',                  'handler.run',               'file.func main'],
        ['nested-export',              'handler.api.v1.run',        'file.a.b.c nested export'],
        ['single-file',                'main',                      'single "exec" file wrapped into main.js'],
    ];

    for (const [fixture, main, note] of ok) {
        it(`${fixture} (${note}): acks, runs, writes sentinels`, async function () {
            const { dir, res } = compile(fixture, main);
            assert.equal(res.status, 0, res.stderr);
            const r = await runOnce(dir, { name: 'ow' });
            assert.deepEqual(r.ack, { ok: true });
            assert.deepEqual(r.result, { kind: fixture, name: 'ow', ...(fixture === 'esm-type-module' ? { base: 'b.txt' } : {}) });
            assert.ok(r.stdout.includes(SENTINEL), 'stdout sentinel');
            assert.ok(r.stderr.includes(SENTINEL), 'stderr sentinel');
        });
    }

    it('serves several activations from one initialized process', async function () {
        const { dir } = compile('esm-type-module', 'main');
        const a = start(dir);
        try {
            assert.deepEqual(JSON.parse(await a.line(0)), { ok: true });
            for (const [i, name] of ['a', 'b', 'c'].entries()) {
                a.child.stdin.write(JSON.stringify({ value: { name } }) + '\n');
                assert.equal(JSON.parse(await a.line(i + 1)).name, name);
            }
        } finally {
            a.child.kill();
            await a.exited;
        }
    });

    it('exports __OW_* activation fields to the environment', async function () {
        const { dir } = compile('cjs-index', 'main');
        fs.writeFileSync(path.join(dir, 'index.js'),
            "exports.main = () => ({ id: process.env.__OW_ACTIVATION_ID });\n");
        const a = start(dir);
        try {
            await a.line(0);
            a.child.stdin.write(JSON.stringify({ value: {}, activation_id: 'abc123' }) + '\n');
            assert.equal(JSON.parse(await a.line(1)).id, 'abc123');
        } finally { a.child.kill(); await a.exited; }
    });

    it('reports a handler that throws as an error result and keeps running', async function () {
        const { dir } = compile('cjs-index', 'main');
        fs.writeFileSync(path.join(dir, 'index.js'), "exports.main = () => { throw new Error('boom'); };\n");
        const a = start(dir);
        try {
            await a.line(0);
            a.child.stdin.write(JSON.stringify({ value: {} }) + '\n');
            assert.deepEqual(JSON.parse(await a.line(1)), { error: 'boom' });
        } finally { a.child.kill(); await a.exited; }
    });

    // Failure paths: the ack must NOT be sent unless the handler loaded.
    for (const [fixture, expected] of [
        ['broken-syntax', /SyntaxError/],
        ['missing-function', /not a function/],
    ]) {
        it(`${fixture}: exits non-zero without acking`, async function () {
            const { dir, res } = compile(fixture, 'main');
            assert.equal(res.status, 0, res.stderr);
            const a = start(dir);
            const exit = await a.exited;
            assert.notEqual(exit.code, 0);
            assert.deepEqual(a.fd3, [], 'no ack on fd 3');
            assert.match(a.out().stdout, expected);
        });
    }

    // Known behavior change of switching require() -> import(): named exports must be statically
    // detectable. Mirrors runner.js (normal init path), so the two paths are now consistent.
    it('cjs-dynamic-exports: documents that runtime-built exports are not visible via import()', async function () {
        const { dir } = compile('cjs-dynamic-exports', 'main');
        const a = start(dir);
        const exit = await a.exited;
        assert.notEqual(exit.code, 0);
        assert.deepEqual(a.fd3, []);
    });
});
