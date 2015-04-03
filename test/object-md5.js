'use strict';

var objectMd5 = require('../lib/object-md5'),
    expect = require('must');

describe('object-md5', function() {
    it('must calculate md5 hash for an empty object', function() {
        expect(objectMd5({})).to.equal('d751713988987e9331980363e24189ce');
    });

    it('must calculate md5 hash for an object', function() {
        expect(objectMd5({a: 1, b: 2})).to.equal('eda948b2ebf3ca8685938252dbc7fcdc');
        expect(objectMd5({b: 2, a: 1})).to.equal('eda948b2ebf3ca8685938252dbc7fcdc');
    });
});
