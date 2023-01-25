/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Object which encapsulates a first-class function, the user code for an action.
 *
 * This file (runner.js) must currently live in root directory for nodeJsAction.
 */
const fs = require('fs');
const path = require('path');

/**
 * Initializes the handler for the user function.
 * @param {Object} message
 * @returns {Promise<Function>}
 */
function initializeActionHandler(message) {
    if (message.binary) {
        // The code is a base64-encoded zip file.
        return unzipInTmpDir(message.code)
            .then(moduleDir => {
                let parts = splitMainHandler(message.main);
                if (parts === undefined) {
                    // message.main is guaranteed to not be empty but be defensive anyway
                    return Promise.reject('Name of main function is not valid.');
                }

                // If there is only one property in the "main" handler, it is the function name
                // and the module name is specified either from package.json or assumed to be index.js.
                let [index, main] = parts;

                // Set the executable directory to the project dir.
                process.chdir(moduleDir);

                const packageJsonExists = fs.existsSync('package.json')
                const indexJSExists = fs.existsSync('index.js')
                const indexMJSExists = fs.existsSync('index.mjs')
                if (index === undefined && !packageJsonExists && !indexJSExists && !indexMJSExists) {
                    return Promise.reject('Zipped functions must contain either package.json or index.[m]js at the root.');
                }

                let mainFile
                if (index !== undefined) {
                    // Backwards compat: We allow for main definitions like: `file.a.b.c`
                    // where we'd import the function a.b.c from `file.[m]js`.
                    if (fs.existsSync(index + '.js')) {
                        mainFile = index + '.js'
                    } else if (fs.existsSync(index + '.mjs')) {
                        mainFile =  index + '.mjs'
                    }
                }
                if (!mainFile && packageJsonExists) {
                    // Infer the main file from package.json by default.
                    let package = JSON.parse(fs.readFileSync('package.json'));
                    mainFile = package.main
                } 
                if (!mainFile && indexMJSExists) {
                    mainFile = 'index.mjs'
                }
                if (!mainFile) {
                    mainFile = 'index.js'
                }

                //  The module to require.
                let handler = eval('import("' + path.join(moduleDir, mainFile) + '").then(evaled => evaled.' + main + ')');
                return handler.then(func => assertMainIsFunction(func, message.main))
            })
            .catch(error => Promise.reject(error));
    } else {
        return new Promise((resolve) => {
            // Throws on error and rejects the promise as a consequence.
            // In the eval below, ${message.code} will template in the user's code. ${message.main} will template in the
            // name of the main function. So the code ends up being evaluated, which has the effect of declaring a
            // function, and then that function is returned. If an error is thrown
            // while trying to return the function using the current scope, and the error is ReferenceError, we assume
            // that the user provided code by exporting a module instead of putting a function at the top level of their
            // file, and we return what they exported instead.
            // Either way, the result of eval will be the user's main function, as a function (not as a string etc.).
            let handler = eval(
                `(function(){
                    ${message.code}
                    try {
                        return ${message.main}
                    } catch (e) {
                        if (e.name === 'ReferenceError') {
                            return module.exports.${message.main} || exports.${message.main}
                        } else throw e
                    }
                })()`)
            resolve(handler)
        })
        .then(func => assertMainIsFunction(func, message.main))
        .catch(_ => {
            // Write file as ES modules need to be loaded from files.
            fs.writeFileSync('index.mjs', message.code)
            return eval('import("' + process.cwd() + '/index.mjs").then(evaled => evaled.' + message.main + ')');
        })
        .then(func => assertMainIsFunction(func, message.main))
    }
}

class NodeActionRunner {

    constructor(handler) {
        this.userScriptMain = handler;
    }

    run(args) {
        let deadline = Number(process.env['__OW_DEADLINE']);
        let context = {
            functionName: process.env['__OW_ACTION_NAME'],
            functionVersion: process.env['__OW_ACTION_VERSION'],
            activationId: process.env['__OW_ACTIVATION_ID'],
            requestId: process.env['__OW_TRANSACTION_ID'],
            deadline: deadline,
            apiHost: process.env['__OW_API_HOST'],
            apiKey: process.env['__OW_API_KEY'] || '',
            namespace: process.env['__OW_NAMESPACE'],
            getRemainingTimeInMillis: function() {
                return deadline - new Date().getTime();
            }
        }

        return new Promise((resolve, reject) => {
            try {
                var result = this.userScriptMain(args, context);
            } catch (e) {
                reject(e);
            }

            this.finalizeResult(result, resolve);
        });
    };

    finalizeResult(result, resolve) {
        // Non-promises/undefined instantly resolve.
        Promise.resolve(result).then(resolvedResult => {
            // This happens, e.g. if you just have "return;"
            if (typeof resolvedResult === "undefined") {
                resolvedResult = {};
            }
            resolve(resolvedResult);
        }).catch(error => {
            // A rejected Promise from the user code maps into a
            // successful promise wrapping a whisk-encoded error.

            // Special case if the user just called "reject()".
            if (!error) {
                resolve({error: {}});
            } else {
                const serializeError = require('serialize-error');
                resolve({error: serializeError(error)});
            }
        });
    }
}

/**
 * Copies the base64 encoded zip file contents to a temporary location,
 * decompresses it and returns the name of that directory.
 *
 * Note that this makes heavy use of shell commands because the environment is expected
 * to provide the required executables.
 */
function unzipInTmpDir(zipFileContents) {
    const mkTempCmd = "mktemp -d XXXXXXXX";
    return exec(mkTempCmd).then(tmpDir => {
        return new Promise((resolve, reject) => {
            const zipFile = path.join(tmpDir, "action.zip");
            fs.writeFile(zipFile, zipFileContents, "base64", err => {
                if (!err) resolve(zipFile);
                else reject("There was an error reading the function archive.");
            });
        });
    }).then(zipFile => {
        return exec(mkTempCmd).then(tmpDir => {
            return exec("unzip -qq " + zipFile + " -d " + tmpDir)
                .then(res => path.resolve(tmpDir))
                .catch(error => Promise.reject("There was an error uncompressing the function archive."));
        });
    });
}

/** Helper function to run shell commands. */
function exec(cmd) {
    const child_process = require('child_process');

    return new Promise((resolve, reject) => {
        child_process.exec(cmd, (error, stdout, stderr) => {
            if (!error) {
                resolve(stdout.trim());
            } else {
                reject(stderr.trim());
            }
        });
    });
}

/**
 * Splits handler into module name and path to main.
 * If the string contains no '.', return [ undefined, the string ].
 * If the string contains one or more '.', return [ string up to first period, rest of the string after ].
 */
function splitMainHandler(handler) {
    let matches = handler.match(/^([^.]+)$|^([^.]+)\.(.+)$/);
    if (matches && matches.length == 4) {
        let index = matches[2];
        let main = matches[3] || matches[1];
        return [index, main]
    } else return undefined
}

function assertMainIsFunction(handler, name) {
    if (typeof handler === 'function') {
        return Promise.resolve(handler);
    } else {
        return Promise.reject("Function entrypoint '" + name + "' is not a function.");
    }
}

module.exports = {
    NodeActionRunner,
    initializeActionHandler
};
