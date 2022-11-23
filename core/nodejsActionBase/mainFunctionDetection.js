/**
 * Detects whether the main function provided is Lambda or OpenWhisk.
 * @param {Function} fn The function.
 * @returns {boolean} Whether the function is a Lambda function.
 */
function isLambda(fn) {
    if (fn.length === 2) {
        return true;
    }

    if (fn.length === 1) {
        return false;
    }

    throw new Error('Function must have 1 or 2 parameters to be valid.');
}

// TODO: The implementation above throws an error for invalid functions. I assumed that was a good idea, but how would
//  we handle those errors?

// TODO: The implementation is super simple. I forget... did we talk about needing to do more than just check number of
//  params, or did we conclude that would be enough?

module.exports = {
    isLambda,
};
