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

  const lambdaCompat = process.env.__LAMBDA_COMPAT === undefined ? false : process.env.__LAMBDA_COMPAT.toLowerCase() === 'true' && NodeActionLambdaRunner !== undefined;
  const handler = eval('require("./##MAIN_FILE##").##MAIN_FUNC##') // Will be replaced in the compile script with the correct main.
  const runner = lambdaCompat === false ? new NodeActionRunner(handler) : new NodeActionLambdaRunner(handler);

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
  if (e.code == "MODULE_NOT_FOUND") {
    console.log("Zipped actions must contain either package.json or index.js at the root.")
  }
  console.log(e)
  process.exit(1)
}

function writeMarkers() {
  console.log('XXX_THE_END_OF_A_WHISK_ACTIVATION_XXX');
  console.error('XXX_THE_END_OF_A_WHISK_ACTIVATION_XXX');
}
