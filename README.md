# express-cli-builder

[![npm version](https://img.shields.io/npm/v/express-cli-builder)](https://www.npmjs.com/package/express-cli-builder)
[![npm downloads](https://img.shields.io/npm/dm/express-cli-builder)](https://www.npmjs.com/package/express-cli-builder)
[![tests](https://github.com/Asad-ali349/express-cli-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/Asad-ali349/express-cli-builder/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/express-cli-builder)](https://nodejs.org/)
[![license](https://img.shields.io/npm/l/express-cli-builder)](LICENSE)

**A command-line tool that sets up Express.js projects and generates their building blocks.**

Start a new Express app in TypeScript or JavaScript, with MongoDB, MySQL or no database, in a simple layout for small apps or a modular, NestJS-style layout for larger ones. Then generate models, routes, controllers, services, validations, middlewares or complete CRUD resources that are wired together and work right away.

- **Two project sizes:** a simple layer-based layout, or feature modules with optional extras (logging, security, tests, linting, Swagger, Docker and more).
- **Working CRUD in one command:** `create:resource` generates the model, validation, route, controller (and service), mounts the route and gives you five REST endpoints.
- **Safe by default:** nothing is overwritten without `--force`, names are validated, input is validated with zod, empty records are never saved, and internal errors are never shown to clients.
- **Matches your project:** files follow your layout, language (`.ts` / `.js`), module system and database.

## Why express-cli-builder?

| | express-cli-builder | express-generator | NestJS CLI |
| --- | --- | --- | --- |
| What you get | A plain Express API | A plain Express app with server-rendered views | An app built on the NestJS framework |
| TypeScript | Yes, or JavaScript | JavaScript only | TypeScript |
| Database setup | MongoDB or MySQL, wired in | None | Add it yourself |
| Generate parts later | Resources, models, routes, controllers, services, validations, middlewares | No; it creates the initial app only | Yes |
| Concepts to learn | Express only | Express only | NestJS (decorators, modules, dependency injection) |

Choose express-cli-builder when you want to stay with plain Express but skip the repetitive setup: a ready project, input validation, error handling, and CRUD endpoints that work from the first command.

## Requirements

- Node.js 18 or later
- npm

## Installation

```bash
npm install -g express-cli-builder
```

This installs two commands that do the same thing: `express` and `express-cli`.

> **Tip:** If `express` runs a different tool on your machine (for example, because you also installed `express-generator`), use `express-cli` instead. Both names run this tool. The examples below use `express`.

## Quick start

```bash
mkdir shop-api && cd shop-api
express init                      # answer the questions
express create:resource product   # model, validation, route, controller (+ service)
npm run dev                       # http://localhost:3000/product
```

Open the generated validation file and add your fields. Until then, `POST` and `PUT` answer `501` (see [Validation](#create-a-validation)).

## Commands at a glance

| Command | What it does |
| --- | --- |
| `express init` | Create a new project in the current (empty) directory |
| `express create:resource <name>` | Model + validation + route + controller (+ service in Large projects), mounted and ready |
| `express create:model <name>` | Mongoose model or mysql2 query module |
| `express create:controller <name>` | Controller with five CRUD handlers (stubs answering `501`) |
| `express create:route <name>` | Route file with five REST routes, mounted automatically |
| `express create:validation <name>` | zod `create` and `update` schemas |
| `express create:service <name>` | Service with business logic (Large projects only) |
| `express create:middleware <name>` | Middleware function |
| `express --help`, `express <command> --help` | All commands, or the options of one command |
| `express --version` | Installed version |

Options:

| Option | Commands | Effect |
| --- | --- | --- |
| `-f, --force` | all `create:*`, `init` | Overwrite files that already exist |
| `-m, --module <name>` | all `create:*` except `create:resource` | Put the file in that module (Large projects) |
| `--database <MongoDB\|MySQL>` | `create:model`, `create:resource` | Database to set up if the project has none |
| `--skip-install` | `init`, `create:model`, `create:resource`, `create:validation` | Do not run `npm install`; print the command instead |
| `--no-mount` | `create:route`, `create:resource` | Do not register the route automatically |
| `--controller`, `--no-controller` | `create:route` | Create (or not) a missing controller without asking |
| `--docs`, `--no-docs` | `create:resource` | Add (or not) Swagger docs for the module without asking |
| `--tests`, `--no-tests` | `create:resource` | Add (or not) tests for the module without asking |

## Create a project: `express init`

Run it in an empty directory. It refuses to run where a `package.json` already exists, unless you pass `--force`; an existing `.env` or `.gitignore` is never overwritten. It asks:

1. **Project size:** Small (simple structure) or Large (modular, scalable)
2. **Language:** TypeScript or JavaScript
3. **`src` folder?** (Small only; Large projects always use `src`)
4. **Database:** MongoDB, MySQL or None
5. **Extras** (Large only; nothing is selected by default)

It then writes the files and installs the packages:
- `express`, `cors` and `dotenv`, plus `mongoose` or `mysql2`, plus the packages of the extras you chose.
- With TypeScript: also `typescript`, `tsx` and type definitions.
- Package versions are pinned to tested major versions.
- A `.env` file and a `.gitignore` (which excludes `.env`) are created too.

### Small projects

```
app.ts                 # the Express app and server start
config/db.config.ts    # when a database is chosen
controllers/  routes/
models/                # when a database is chosen
middlewares/error.middleware.ts
utils/errors.ts
```

The `validations/` and `services/` folders are created later, by the commands that need them. With "use the src folder" everything sits in `src/`.

### Large projects (modular)

Each feature lives in its own module, similar to NestJS but with plain functions:

```
src/
  server.ts            # loads config, connects the database, starts listening
  app.ts               # builds the Express app (exported, so tests can use it)
  routes.ts            # every module's routes are registered here automatically
  config/              # db.config, env (with the .env validation extra)
  common/              # shared code: errors, middlewares, utils, and anything created without --module
  modules/
    user/
      user.routes.ts
      controllers/user.controller.ts   # thin: request -> service -> response
      services/user.service.ts         # business logic, throws NotFoundError
      models/user.model.ts
      validations/user.validation.ts
      docs/user.docs.ts                # with the Swagger extra, if you say yes for this module
      tests/user.test.ts               # with the Testing extra, if you say yes for this module
```

Extras you can pick:

| Extra | What you get |
| --- | --- |
| .env validation (zod) | `src/config/env` checks your `.env` at startup and stops with a clear message if something is missing or invalid |
| Logger (pino) | Structured application logs and request logs |
| API prefix | All modules are served under `/api/v1` |
| Security | `helmet` headers and rate limiting (100 requests per 15 minutes per client) |
| Testing (vitest + supertest) | `npm test`, a first test for the app, and per-module API tests |
| ESLint + Prettier | `npm run lint` and `npm run format` |
| Swagger API docs | Swagger UI at `/api-docs`, filled in from each module's docs |
| Docker | `Dockerfile`, `.dockerignore` and a `docker-compose.yml` with your database |

The size and extras are saved in `package.json` under `"expressCli"`, so later `create:*` commands know the project is modular and which extras it has. Projects without this entry are treated as Small.

### Run the generated app

| Script | JavaScript | TypeScript |
| --- | --- | --- |
| `npm run dev` | `node --watch` (restarts on change) | `tsx watch` (restarts on change) |
| `npm start` | runs the app with `node` | compiles with `tsc`, then runs the compiled app |
| `npm run build` | – | compiles to `dist/` |

- **Entry point:** `app` in Small projects, `server` in Large ones (for example `dist/server.js`).
- **Port:** the server listens on `PORT` from `.env` (default 3000).
- **If it cannot start** (for example the port is in use, or the database is unreachable), it prints the reason and exits with code 1.

### Error handling (both sizes)

Every project gets a 404 handler and an error handler that turn errors into JSON:

| Situation | Response |
| --- | --- |
| Unknown route | `404 { "message": "Route GET /x not found" }` |
| `throw new NotFoundError(...)` / other `AppError` | Its status and message |
| Malformed JSON body | `400 Malformed JSON in request body` |
| Malformed database id (MongoDB) | `400 Invalid _id` |
| Duplicate value in a unique field | `409 Duplicate value` |
| Anything else | `500 { "message": "Internal server error" }`; the real error is written to the server log, never sent to the client |

## Rules for all `create:*` commands

- **Names:** letters, digits, `-` and `_`, starting with a letter (for example `user` or `user-profile`). Paths such as `../x` are rejected.
- **No overwriting:** existing files are never overwritten unless you pass `--force`. If a command would overwrite something, nothing is written at all.
- **Matches the project:**
  - files go into `src/` when a `src` folder exists;
  - they use `.ts` when the project has a `tsconfig.json`;
  - they follow the module system (ES modules for TypeScript and `"type": "module"` projects, CommonJS otherwise).
- **Large projects:** without `--module`, a single command puts its file in `src/common/<type>/`. With `--module <name>` it goes into that module, for example `express create:model address --module user` creates `src/modules/user/models/address.model.ts`. The module must already exist.
- **Without a terminal (scripts, CI):** commands never wait for an answer. Use the flags above to answer questions up front.

## Create a resource

```bash
express create:resource <name>
```

| Small project | Large project |
| --- | --- |
| model, validation, route and controller in their folders | the whole `src/modules/<name>/` module, including a service |
| route mounted in the app file at `/<name>` | route registered in `src/routes` (under `/api/v1` with the API prefix extra) |

In Large projects with the Swagger or Testing extra, you are asked whether to add docs and tests for this module (or use `--docs` / `--tests`).

The resource answers these endpoints right away:

| Method | Path | Response |
| --- | --- | --- |
| GET | `/<name>` | 200 with all records |
| GET | `/<name>/:id` | 200, or 404 if not found |
| POST | `/<name>` | 201 with the new record, or 400 if validation fails |
| PUT | `/<name>/:id` | 200, 400 if validation fails, or 404 if not found |
| DELETE | `/<name>/:id` | 200, or 404 if not found |

Next step: add your fields to the model and to the validation. Until the validation has fields, `POST` and `PUT` answer `501`.

## Create a model

```bash
express create:model <name>
```

- **MongoDB projects** get a Mongoose model; **MySQL projects** get a `mysql2` module with `findAll`, `findById`, `create`, `update` and `remove`. MySQL models expect a table with an auto-increment `id`.
- **If the project has no database yet,** you are asked which one to use (or pass `--database MongoDB` / `--database MySQL`). The command then:
  - installs the driver;
  - creates `config/db.config`;
  - calls `connectDB()` at startup;
  - adds the connection settings to `.env` (and to `src/config/env` with the .env validation extra).
- **MongoDB** projects wait for each model's indexes (for example unique fields) before accepting requests, so unique constraints hold from the first request. If an index cannot be built, for example because duplicates already exist, a warning is logged and the app still starts.

## Create a route

```bash
express create:route <name>
```

The route file has the five REST routes and is mounted for you:

```js
import userRoutes from './routes/user.routes.js';
app.use('/user', userRoutes);
```

- **Mounting:** in Large projects the route is registered in `src/routes`. If the file cannot be edited safely, the lines are printed for you to paste instead. Use `--no-mount` to skip this step.
- **Missing controller:** a route uses the controller with the same name. If it does not exist yet, you are asked whether to create it too.
  - **Yes** creates the controller as well.
  - **No** writes the route with the controller import and the route lines commented out, so the app keeps working. Later, run `express create:controller <name>` and uncomment those lines.
  - Without a terminal the answer is no; use `--controller` or `--no-controller` to decide up front.

## Create a controller

```bash
express create:controller <name>
```

Creates the five handlers (`getAll`, `getById`, `create`, `update`, `remove`). On their own they answer `501 Not Implemented` until you write them; controllers made by `create:resource` already call the model (Small) or the service (Large).

## Create a validation

```bash
express create:validation <name>
```

Creates a [zod](https://zod.dev) `create` schema and an `update` schema (the same fields, all optional). The first time, it also creates the shared `validate` middleware; that file is never overwritten, not even with `--force`. `zod` is installed into your project if it is missing (skip with `--skip-install`).

```ts
export const createUserSchema = z.object({
  // name: z.string().min(1),
  // email: z.email(),
});
export const updateUserSchema = createUserSchema.partial();
```

`create:resource` applies the schemas for you. For a route you wrote yourself:

```js
router.post('/', validate(createUserSchema), create);
router.put('/:id', validate(updateUserSchema), update);
```

How requests are handled:

| Request | Response |
| --- | --- |
| The schema has no fields yet | `501 "POST /user is not ready: its validation schema has no fields yet."`; nothing is saved. You are also warned in the terminal and, once per route, on the server console |
| Invalid body | `400 { "message": "Validation failed", "errors": [{ "path": "email", "message": "..." }] }` |
| Nothing left after cleaning (empty body, or only unknown fields) | `400 { "message": "Request body has no valid fields" }` |
| Valid body | Unknown fields are removed, then the request continues |

## Create a service (Large projects)

```bash
express create:service <name> [--module <module>]
```

Services hold the business logic that controllers call. A service is linked to the model with the same name if it exists; otherwise its functions are stubs that answer `501 Not Implemented`.

## Create a middleware

```bash
express create:middleware <name> [--module <module>]
```

Creates a middleware function that calls `next()`, ready for your logic.

## Upgrading projects created with an earlier version

Shared files are never overwritten, so projects created with an earlier version keep their old behaviour until you update them:

- **Validation (`501` / `400` for empty data):** delete `middlewares/validate.middleware` (in Large projects `src/common/middlewares/validate.middleware`) and run any `express create:validation <name>`; the new version is created.
- **MongoDB indexes:** in `config/db.config`, after `mongoose.connect(...)`, add a loop that runs `await model.init()` for every model in `mongoose.models`. A fresh `express init` project shows the exact code.
- **Hidden 500 messages:** in the error middleware, make the final 500 response always use `'Internal server error'`.

## Development

```bash
git clone https://github.com/Asad-ali349/express-cli-builder.git
cd express-cli-builder
npm install
npm test
```

The tests use the built-in Node.js test runner. `npm install` also installs `express`, `cors` and `zod` as development dependencies, which some tests use to run generated code for real. To try your local copy as a global command, run `npm link`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## License

[ISC](LICENSE)
