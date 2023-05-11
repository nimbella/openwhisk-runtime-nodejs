#!/usr/local/bin/node

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

const useLambdaRunner = require('/nodejsAction/useLambdaRunner');
const readline = require('readline');
const fs = require("fs")

try {
  const { NodeActionRunner, initializeActionHandler } = require('/nodejsAction/runner');
  const NodeActionLambdaRunner = (() => {
    try {
        let lambda = require('/nodejsAction/lambda');
        return lambda;
    } catch (e) {}
  })();

  /**
   * Initializes the user's function. Expected to be called with first line from ActionLoop input.
   * @param {{ env: Object }} message
   * @returns {NodeActionRunner | NodeActionLambdaRunner} The runner to use with the function.
   */
  function doInit(message) {
    if (message.env && typeof message.env == 'object') {
      Object.keys(message.env).forEach(k => {
        let val = message.env[k];
        if (typeof val !== 'object' || val == null) {
          process.env[k] = val ? val.toString() : "";
        } else {
          process.env[k] = JSON.stringify(val);
        }
      });
    }

    return initializeActionHandler(message)
      .then(handler => {
        return useLambdaRunner(handler) ? new NodeActionLambdaRunner(handler) : new NodeActionRunner(handler);
      });
  }

  async function actionLoop() {
    let initialized = false
    let runner = null

    const out = fs.createWriteStream(null,{fd: 3, encoding: "utf8"})
    process.stdin.setEncoding('utf8');
    const rl = readline.createInterface({input: process.stdin});
    out.write(JSON.stringify({ "ok": true }) + "\n");

    for await (const line of rl) {
      try {
        let args = JSON.parse(line)
        let value = args.value || {}

        if (!initialized) {
          // The first value sent through is the actual init.
          runner = await doInit(value)
          initialized = true
          out.write(JSON.stringify({ "ok": true }) + "\n");
          continue;
        }

        for (let key in args) {
          if (key !== "value") {
            let envar = "__OW_" + key.toUpperCase()
            process.env[envar] = args[key]
          }
        }
        let result = await runner.run(value).then(result => {
            if (typeof result !== 'object') {
                console.error(`Result must be of type object but has type "${typeof result}":`, result);
            }
            writeMarkers();
            return result;
        });

        out.write(JSON.stringify(result) + "\n");
      } catch (err) {
        console.log(err);
        let message = err.message || err.toString()
        let error = { "error": message }
        writeMarkers();
        out.write(JSON.stringify(error) + "\n");
      }
    }
  }
  actionLoop()
} catch (e) {
  console.log(e)
  process.exit(1)
}

// Create explicit stdout and stderr streams for the sentinels to avoid users tampering with the output.
const stdout = fs.createWriteStream(null, {fd: 1, encoding: "utf8"})
const stderr = fs.createWriteStream(null, {fd: 2, encoding: "utf8"})

function writeMarkers() {
  stdout.write('XXX_THE_END_OF_A_WHISK_ACTIVATION_XXX\n');
  stderr.write('XXX_THE_END_OF_A_WHISK_ACTIVATION_XXX\n');
}
