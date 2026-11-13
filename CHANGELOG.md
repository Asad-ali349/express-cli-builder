# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.2] - 2026-11-13

### Added
- LICENSE file, this changelog, README badges and a comparison with other Express tools.
- Continuous integration: the test suite runs on every push and pull request.
- Releases are published from GitHub Actions with npm provenance.

### Changed
- Shorter npm description and more relevant keywords.

## [2.0.1] - 2026-11-13

### Changed
- Simpler README tip about the command name: if `express` runs a different tool on your machine (for example `express-generator`), use `express-cli` instead.

## [2.0.0] - 2026-11-13

### Added
- `express init` asks for the project size: **Small** keeps the simple layer layout, **Large** creates a modular, NestJS-style layout (`src/modules/<name>/` with routes, controllers, services, models and validations).
- Optional extras for Large projects, all off by default: .env validation (zod), logger (pino), `/api/v1` prefix, security (helmet + rate limiting), testing (vitest + supertest), ESLint + Prettier, Swagger docs and Docker.
- `create:resource` generates working CRUD: model, zod validation, route, controller and (in Large projects) service, with the route mounted automatically.
- New commands `create:validation` and `create:service`; `--module` places files inside a module.
- `create:route` offers to create a missing controller (`--controller` / `--no-controller`).
- `create:model` sets up a database (driver, config, startup connection, `.env`) when the project has none (`--database`).
- Error handling in every generated project: JSON 404s, `AppError` classes, 400 for malformed ids and JSON, 409 for duplicate values.
- `--force`, `--skip-install`, `--no-mount`, `--docs` / `--tests` and `--version` options.
- A test suite of 166 tests (`npm test`).

### Changed
- **Breaking:** `express init` asks new questions (project size, database, extras) and refuses to run in a folder that already has a `package.json` unless `--force` is given.
- **Breaking:** an empty validation schema answers `501` and a body with no valid fields answers `400`, so empty records are never saved.
- Generated projects pin dependency major versions, include a `.gitignore`, and use working `dev`, `start` and `build` scripts for JavaScript and TypeScript.
- Unexpected errors answer `500 Internal server error`; details are logged on the server only.
- MongoDB projects build model indexes before accepting requests.

### Fixed
- Generated models and middlewares crashed in ES module projects.
- TypeScript projects could not build or start.
- `init` overwrote existing `package.json`, `.env` and app files.
- `create:*` silently overwrote existing files and accepted names such as `../x` (path traversal).
- Hyphenated names produced invalid code.

## [1.1.4] and earlier - 2024

The first releases: `express init` for a basic JavaScript or TypeScript app with MongoDB or MySQL, and the `create:model`, `create:route`, `create:controller`, `create:middleware` and `create:resource` commands.

[Unreleased]: https://github.com/Asad-ali349/express-cli-builder/compare/v2.0.2...HEAD
[2.0.2]: https://github.com/Asad-ali349/express-cli-builder/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/Asad-ali349/express-cli-builder/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Asad-ali349/express-cli-builder/releases/tag/v2.0.0
