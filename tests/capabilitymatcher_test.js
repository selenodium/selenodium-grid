var matcher = require('../lib/capabilitymatcher');

var http = require('http');
var should = require('should');
var request = require('supertest');
var assert = require('assert');
var models = require('../lib/models');
var registry = require('../lib/registry');
var store = require('../lib/store');

describe('CapabilityMatcher', function() {
	describe('Correctly find a match', function() {
		beforeEach(function(done) {
			store.removeAllAvailableNodes(done);
		});

		it('should correctly find a full match', function(done) {
			// Store capabilities keys should be all in lower case
            var caps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'};

            store.addAvailableNode(new models.Node('127.0.0.1', 5556, [caps]), function() {
				matcher.findNode(caps, function(node) {
					node.host.should.equal('127.0.0.1');
					done();
				}, true);
			});
		});

		it('should find a version even if it\'s a string', function(done) {
			var storeCaps = {browsername: 'firefox', version: '14', platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: 'WINDOWS'};

            store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode(findCaps, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should be case-insensitive', function(done) {
            var storeCaps = {browsername: 'firefox', version: '14', platform: 'WINDOWS'},
                findCaps = {browserName: 'FIREFOX', Version: '14', platform: 'windows'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode(findCaps, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should not crash when the user asks for a permission which is not registered on the node', function(done) {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: 'WINDOWS', cherries: 'ontop'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode(findCaps, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should be able to handle empty desired capabilities', function(done) {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode({}, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should be able to handle incorrect capabilities', function(done) {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode({nothing: 'else'}, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should correctly find a node when the user asks for ANY OS', function(done) {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: 'ANY'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode(findCaps, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should correctly find a node when the user asks for ANY OS', function(done) {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox', version: 14, platform: '*'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode(findCaps, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should correctly find a node with just one desired capability', function(done) {
            var storeCaps = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                findCaps = {browserName: 'firefox'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps]), function() {
				matcher.findNode(findCaps, function(node) {
					node.host.should.equal('127.0.0.2');
					done();
				}, true);
			});
		});

		it('should pick the correct node that corresponds to our desired_capabilities', function(done) {
            var storeCaps1 = {browsername: 'firefox', version: 14, platform: 'WINDOWS'},
                storeCaps2 = {browsername: 'firefox', version: 13, platform: 'LINUX'},
                findCaps = {browserName: 'firefox', platform: 'LINUX'};

			store.addAvailableNode(new models.Node('127.0.0.2', 5556, [storeCaps1]), function() {
				store.addAvailableNode(new models.Node('127.0.0.3', 5556, [storeCaps2]), function() {
					matcher.findNode(findCaps, function(node) {
						node.host.should.equal('127.0.0.3');
						done();
					}, true);
				});
			});
		});
	});
});
