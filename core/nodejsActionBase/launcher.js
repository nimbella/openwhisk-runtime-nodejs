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

try {
  const readline = require('readline');
  const fs = require("fs")

  const { NodeActionRunner } = require('/nodejsAction/runner');
  const NodeActionLambdaRunner = (() => {
    try {
        let lambda = require('/nodejsAction/lambda');
        return lambda;
    } catch (e) {}
  })();

  const handler = eval('require("./##MAIN_FILE##").##MAIN_FUNC##') // Will be replaced in the compile script with the correct main.

  const runner = useLambdaRunner(handler) ? new NodeActionLambdaRunner(handler) : new NodeActionRunner(handler);

  async function actionLoop() {
    const out = fs.createWriteStream(null,
      { fd: 3, encoding: "utf8" })
    process.stdin.setEncoding('utf8');
    const rl = readline.createInterface({
      input: process.stdin
    });
    out.write(JSON.stringify({ "ok": true }) + "\n");
    for await (const line of rl) {
      try {
        let args = JSON.parse(line)
        let value = args.value || {}
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

function writeMarkers() {
  console.log('XXX_THE_END_OF_A_WHISK_ACTIVATION_XXX');
  console.error('XXX_THE_END_OF_A_WHISK_ACTIVATION_XXX');
}
