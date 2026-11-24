// Exports built at runtime: invisible to Node's static CJS named-export detection,
// so import() does NOT expose `main` as a named export. require() would have worked.
const api = {};
api['ma' + 'in'] = (args) => ({ kind: 'cjs-dynamic-exports', name: args.name });
Object.assign(module.exports, api);
