# selenodium-grid

[![npm version][npm-badge]][npm-url] [![node version][node-badge]][node-url] [![license][license-badge]][license-url]

[![Build Status][travis-badge]][travis-url] [![Coverage Status][coveralls-badge]][coveralls-url] [![Dependency Status][david-badge]][david-url] [![devDependency Status][david-dev-badge]][david-dev-url]

Selenium Hub/Grid reimplementations in NodeJS.

First it was a fork with a goal to fix some bugs in TestingBot's [node-seleniumgrid].
But now it is a nerly total rewrite of it using [q] and [q-io].

## Goals

Some of them are:

- to make a server with a full implementation of [Selenium Grid v2 protocol]
- to let it run in a distributed environment (many data centers across the planet)
- to make it easy to extend for front-end engineers
- to make the [Appium](http://appium.io) to be the first class citizen
  (respect it's `platformName` and `platformVersion` capapilities)

## Requirements

General:

- [NodeJS](http://nodejs.org), at least v0.10
- [npm](http://npmjs.org)

## Quick Start

1. Install and run:

    - `npm -g install selenodium-grid`
    - `selenodium-grid`

    You now have a local Selenium grid running on port `4444`.

2. Start a Selenium node and point it to this grid, it should register to the grid.

   `java -jar selenium-standalone.jar -role node -hub http://my-computer-ip:4444/grid/register`

3. Now run a simple Selenium test against your new grid, depending on the capabilities
   you requested it should forward the test to your Selenium node. Point your tests to the url like:

   `http://my-computer-ip:4444/wd/hub`

## Troubleshooting

If you encounter problems setting this up, please open a ticket in the issues section.

## Tests

There are tests included in this project. To run them:

`npm test`

## Contributing

Fork the project, make a change, and send a pull request!

## License

Licensed under the [Apache License, Version 2.0][license-url].

[travis-badge]: https://travis-ci.org/selenodium/selenodium-grid.svg?branch=dev
[travis-url]: https://travis-ci.org/selenodium/selenodium-grid
[coveralls-badge]: https://coveralls.io/repos/selenodium/selenodium-grid/badge.svg?branch=dev
[coveralls-url]: https://coveralls.io/r/selenodium/selenodium-grid?branch=dev
[david-badge]: https://david-dm.org/selenodium/selenodium-grid.svg
[david-url]: https://david-dm.org/selenodium/selenodium-grid
[david-dev-badge]: https://david-dm.org/selenodium/selenodium-grid/dev-status.svg
[david-dev-url]: https://david-dm.org/selenodium/selenodium-grid#info=devDependencies
[npm-badge]: https://img.shields.io/npm/v/selenodium-grid.svg.svg
[npm-url]: http://packages.npmjs.org/selenodium-grid
[node-badge]: https://img.shields.io/node/v/selenodium-grid.svg
[node-url]: http://nodejs.org/
[license-badge]: https://img.shields.io/npm/l/selenodium-grid.svg
[license-url]: http://www.apache.org/licenses/LICENSE-2.0
[node-seleniumgrid]: https://github.com/testingbot/node-seleniumgrid
[Selenium Grid v2 protocol]: https://github.com/nicegraham/selenium-grid2-api
[q]: https://github.com/kriskowal/q
[q-io]: https://github.com/kriskowal/q-io
