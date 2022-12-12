const envVarName = '__OW_LAMBDA_COMPAT';

/**
 * Decides, based on environment variables and, if needed, the function signature, where to use the Lambda runner
 * instead of the OpenWhisk runner.
 * @param {Function} fn The function.
 * @returns {boolean} Whether the Lambda runner should be used to run the function.
 */
function useLambdaRunner(fn) {
    // Backwards compat: Deem function to be Lambda if env var is provided. This can be removed when we remove the
    // Lambda only variant of the Node.js runtime. At that point, we would only use the Lambda runner if we detect that
    // the function signature is Lambda-like.
    if (process.env[envVarName] !== undefined && process.env[envVarName].toLowerCase() === 'true') {
        return true;
    }
}

module.exports = useLambdaRunner;
