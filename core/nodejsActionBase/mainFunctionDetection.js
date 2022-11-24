/**
 * Detects whether the main function provided is Lambda or OpenWhisk.
 * @param {Function} fn The function.
 * @returns {boolean} Whether the function is a Lambda function.
 */
function isLambda(fn) {
    if (fn.length <= 1) {
        // Includes no parameter case because we want to treat deployments after GA but before official Lambda support
        // that have no parameters as OpenWhisk (not Lambda).
        return false;
    }

    // Includes >2 parameter cases because we want to maintain compatibility with deployments after GA that have
    // more than two parameters. We have to choose OW or Lambda for them, so we choose Lambda (not for any
    // particular reason though).
    return true;
}

module.exports = {
    isLambda,
};
