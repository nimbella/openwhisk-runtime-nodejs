const expect = require('expect').expect;

const isLambda = require('../mainFunctionDetection').isLambda;

describe('isLambda()', function () {
    it('determines a function with two parameters to be Lambda', function () {
        const fn = function(a, b) {};

        expect(isLambda(fn)).toBe(true);
    });

    it('determines a function with one parameter to not be Lambda', function () {
        const fn = function(a) {};

        expect(isLambda(fn)).toBe(false);
    });

    it('throws an error for a function with fewer than 1 parameters', function () {
        const fn = function() {};

        expect(() => isLambda(fn)).toThrow();
    });

    it('throws an error for a function with more than 2 parameters', function () {
        const fn = function(a, b, c) {};

        expect(() => isLambda(fn)).toThrow();
    });
});
