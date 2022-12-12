const expect = require('chai').expect;

const useLambdaRunner = require('../useLambdaRunner');

const envVarName = '__OW_LAMBDA_COMPAT';

describe('useLambdaRunner()', function () {
    beforeEach(function () {
        delete process.env[envVarName];
    });

    it(`returns true when env var ${envVarName} is set to "true"`, function () {
        process.env[envVarName] = 'true';

        expect(useLambdaRunner(undefined)).to.equal(true);
    });

    it(`returns false when env var ${envVarName} is not set and it is given a function with no parameters`, function () {
        const fn = function() {};

        expect(useLambdaRunner(fn)).to.equal(false);
    });

    it(`returns false when env var ${envVarName} is not set and it is given a function with one parameter`, function () {
        const fn = function(a) {};

        expect(useLambdaRunner(fn)).to.equal(false);
    });

    it(`returns false when env var ${envVarName} is not set and it is given a function with two parameters`, function () {
        const fn = function(a, b) {};

        expect(useLambdaRunner(fn)).to.equal(false);
    });

    it(`returns false when env var ${envVarName} and it is given a function with three parameters`, function () {
        const fn = function(a, b, c) {};

        expect(useLambdaRunner(fn)).to.equal(false);
    });
});
