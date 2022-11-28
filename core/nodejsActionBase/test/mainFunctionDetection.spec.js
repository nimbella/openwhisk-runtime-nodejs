const expect = require('expect').expect;

const isLambda = require('../mainFunctionDetection').isLambda;

describe('isLambda()', function () {
    it('determines a function with no parameters to not be Lambda', function () {
        const fn = function() {};

        expect(isLambda(fn)).toBe(false);
    });

    it('determines a function with one parameter to not be Lambda', function () {
        const fn = function(a) {};

        expect(isLambda(fn)).toBe(false);
    });

    it('determines a function with two parameters to be Lambda', function () {
        const fn = function(a, b) {};

        expect(isLambda(fn)).toBe(true);
    });

    it('determines a function with three parameters to be Lambda', function () {
        const fn = function(a, b, c) {};

        expect(isLambda(fn)).toBe(true);
    });
});
