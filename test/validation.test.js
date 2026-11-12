const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeProject, captureLogs, assertValidEsm, assertValidCjs, read, exists } = require('./helpers');
const validationTemplate = require('../templates/validationTemplate');
const validateMiddlewareTemplate = require('../templates/validateMiddlewareTemplate');
const routeTemplate = require('../templates/routeTemplate');
const createValidation = require('../commands/createValidation');
const createResource = require('../commands/createResource');
const createRoute = require('../commands/createRoute');
const { ensurePackage } = require('../lib/install');

const esm = { moduleType: 'esm', importExt: '.js' };
const cjs = { moduleType: 'cjs', importExt: '' };
const ts = { moduleType: 'ts', importExt: '' };
const esmPkg = { type: 'module', dependencies: { mongoose: '^9.0.0', zod: '^4.0.0' } };
const ZOD = require.resolve('zod');

/** Silences console.warn and returns what was warned. */
function captureWarnings(t) {
  const lines = [];
  t.mock.method(console, 'warn', (...args) => lines.push(args.join(' ')));
  return lines;
}

function fakeResponse() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

/**
 * Loads the generated CommonJS middleware and a schema built with the real zod.
 * `fields` is zod source code for the object shape, e.g. "name: z.string().min(1)".
 */
function loadMiddleware(t, fields) {
  const dir = makeProject(t);
  fs.writeFileSync(path.join(dir, 'validate.middleware.js'), validateMiddlewareTemplate(cjs).replace(/require\('zod'\)/g, `require(${JSON.stringify(ZOD)})`));
  fs.writeFileSync(
    path.join(dir, 'user.validation.js'),
    `const { z } = require(${JSON.stringify(ZOD)});\nconst create = z.object({ ${fields} });\nmodule.exports = { create, update: create.partial() };\n`
  );
  return { ...require(path.join(dir, 'validate.middleware.js')), schemas: require(path.join(dir, 'user.validation.js')) };
}

function runMiddleware(middleware, body, { method = 'POST', baseUrl = '/user', routePath = '/' } = {}) {
  const req = { body, method, baseUrl, path: routePath, route: { path: routePath } };
  const res = fakeResponse();
  let nextCalls = 0;
  middleware(req, res, () => nextCalls++);
  return { req, res, nextCalls };
}

// ---- templates ------------------------------------------------------------

test('validation template exports create and update schemas for every module type', () => {
  const esmCode = validationTemplate('user-profile', esm);
  assertValidEsm(esmCode);
  assert.match(esmCode, /^import \{ z \} from 'zod';$/m);
  assert.match(esmCode, /^export const createUserProfileSchema = z\.object\(\{$/m);
  assert.match(esmCode, /^export const updateUserProfileSchema = createUserProfileSchema\.partial\(\);$/m);
  assert.doesNotMatch(esmCode, /z\.infer/);

  const cjsCode = validationTemplate('user-profile', cjs);
  assertValidCjs(cjsCode);
  assert.match(cjsCode, /module\.exports = \{ createUserProfileSchema, updateUserProfileSchema \};/);

  const tsCode = validationTemplate('user-profile', ts);
  assert.match(tsCode, /^export type CreateUserProfileInput = z\.infer<typeof createUserProfileSchema>;$/m);
  assert.match(tsCode, /^export type UpdateUserProfileInput = z\.infer<typeof updateUserProfileSchema>;$/m);
});

test('the generated schema strips unknown fields (z.object, not loose or strict)', () => {
  const code = validationTemplate('user', esm);
  assert.match(code, /z\.object\(/);
  assert.doesNotMatch(code, /looseObject|strictObject|passthrough|\.strict\(/);
});

test('validate middleware template is valid ESM and CommonJS and typed for TypeScript', () => {
  assertValidEsm(validateMiddlewareTemplate(esm));
  assert.match(validateMiddlewareTemplate(esm), /^export const validate =/m);
  assertValidCjs(validateMiddlewareTemplate(cjs));
  assert.match(validateMiddlewareTemplate(cjs), /module\.exports = \{ validate \};/);
  const tsCode = validateMiddlewareTemplate(ts);
  assert.match(tsCode, /\(schema: z\.ZodType\) => \(req: Request, res: Response, next: NextFunction\)/);
});

test('route with validation applies it to POST and PUT only', () => {
  for (const project of [esm, cjs, ts]) {
    const code = routeTemplate('user-profile', { ...project, withValidation: true });
    assert.match(code, /router\.post\('\/', validate\(createUserProfileSchema\), create\);/);
    assert.match(code, /router\.put\('\/:id', validate\(updateUserProfileSchema\), update\);/);
    assert.match(code, /router\.get\('\/', getAll\);/);
    assert.match(code, /router\.get\('\/:id', getById\);/);
    assert.match(code, /router\.delete\('\/:id', remove\);/);
  }
  assert.match(routeTemplate('user', { ...esm, withValidation: true }), /from '\.\.\/validations\/user\.validation\.js'/);
  assert.match(routeTemplate('user', { ...esm, withValidation: true }), /from '\.\.\/middlewares\/validate\.middleware\.js'/);
  assert.match(routeTemplate('user', { ...ts, withValidation: true }), /from '\.\.\/validations\/user\.validation'/);
  assertValidCjs(routeTemplate('user', { ...cjs, withValidation: true }));
  assertValidEsm(routeTemplate('user', { ...esm, withValidation: true }));
  assert.doesNotMatch(routeTemplate('user', esm), /validate/);
});

// ---- middleware behaviour (real zod) --------------------------------------

test('an invalid body gets a 400 listing every problem and never reaches the controller', (t) => {
  const { validate, schemas } = loadMiddleware(t, 'name: z.string().min(1), email: z.email()');
  const { res, nextCalls } = runMiddleware(validate(schemas.create), { name: '', email: 'nope' });

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Validation failed');
  assert.deepEqual(res.body.errors.map((error) => error.path).sort(), ['email', 'name']);
  assert.ok(res.body.errors.every((error) => typeof error.message === 'string' && error.message.length > 0));
});

test('a missing body is validated as an empty object', (t) => {
  const { validate, schemas } = loadMiddleware(t, 'name: z.string()');
  const { res } = runMiddleware(validate(schemas.create), undefined);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.errors.map((error) => error.path), ['name']);
});

test('a valid body continues with unknown fields stripped', (t) => {
  const warnings = captureWarnings(t);
  const { validate, schemas } = loadMiddleware(t, 'name: z.string().min(1)');
  const { req, nextCalls } = runMiddleware(validate(schemas.create), { name: 'Ali', role: 'admin' });

  assert.equal(nextCalls, 1);
  assert.deepEqual(req.body, { name: 'Ali' });
  assert.deepEqual(warnings, []);
});

test('the update schema accepts a partial body', (t) => {
  const { validate, schemas } = loadMiddleware(t, 'name: z.string().min(1), email: z.email()');
  const { req, nextCalls } = runMiddleware(validate(schemas.update), { email: 'a@b.co' }, { method: 'PUT', routePath: '/:id' });
  assert.equal(nextCalls, 1);
  assert.deepEqual(req.body, { email: 'a@b.co' });
});

test('an empty schema answers 501, saves nothing and warns once per route', (t) => {
  const warnings = captureWarnings(t);
  const { validate, schemas } = loadMiddleware(t, '');
  const create = validate(schemas.create);
  const update = validate(schemas.update);

  const first = runMiddleware(create, { name: 'Ali' });
  runMiddleware(create, { name: 'Sara' });
  const put = runMiddleware(update, { name: 'Ali' }, { method: 'PUT', routePath: '/:id' });
  runMiddleware(update, { name: 'Ali' }, { method: 'PUT', routePath: '/:id' });

  assert.equal(first.nextCalls, 0, 'the controller must not run');
  assert.equal(first.res.statusCode, 501);
  assert.deepEqual(first.res.body, { message: 'POST /user is not ready: its validation schema has no fields yet.' });
  assert.equal(put.res.statusCode, 501);
  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.match(warnings[0], /POST \/user has no fields, so it answers 501/);
  assert.match(warnings[1], /PUT \/user\/:id has no fields/);
});

test('a body with no valid fields left is rejected with 400', (t) => {
  const { validate, schemas } = loadMiddleware(t, 'name: z.string().optional(), note: z.string().optional()');

  for (const body of [{}, { role: 'admin' }, undefined]) {
    const { res, nextCalls } = runMiddleware(validate(schemas.create), body);
    assert.equal(nextCalls, 0, JSON.stringify(body));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: 'Request body has no valid fields' });
  }
  const update = runMiddleware(validate(schemas.update), { hacker: true }, { method: 'PUT', routePath: '/:id' });
  assert.equal(update.res.statusCode, 400, 'empty updates are rejected too');

  const ok = runMiddleware(validate(schemas.create), { note: 'hi', role: 'admin' });
  assert.equal(ok.nextCalls, 1);
  assert.deepEqual(ok.req.body, { note: 'hi' });
});

test('generated ESM middleware and validation load together with the real zod', async (t) => {
  const dir = makeProject(t, { 'package.json': { type: 'module' } });
  const zodUrl = pathToFileURL(require.resolve('zod')).href;
  // Point the generated imports at the CLI's own copy of zod.
  const write = (file, code) => fs.writeFileSync(path.join(dir, file), code.replace("from 'zod'", `from '${zodUrl}'`));
  write('validate.middleware.js', validateMiddlewareTemplate(esm));
  write('user.validation.js', validationTemplate('user', esm).replace('// name: z.string().min(1),', 'name: z.string().min(1),'));

  const { validate } = await import(pathToFileURL(path.join(dir, 'validate.middleware.js')).href);
  const { createUserSchema } = await import(pathToFileURL(path.join(dir, 'user.validation.js')).href);

  assert.equal(runMiddleware(validate(createUserSchema), {}).res.statusCode, 400);
  assert.deepEqual(runMiddleware(validate(createUserSchema), { name: 'Ali', x: 1 }).req.body, { name: 'Ali' });
});

// ---- commands -------------------------------------------------------------

test('create:validation writes the schema and the shared middleware', (t) => {
  captureLogs(t);
  const warnings = captureWarnings(t);
  const cwd = makeProject(t, { 'package.json': esmPkg, 'src/app.js': '' });

  createValidation('user', { cwd });

  assert.match(read(cwd, 'src/validations/user.validation.js'), /createUserSchema/);
  assert.match(read(cwd, 'src/middlewares/validate.middleware.js'), /export const validate/);
  assert.ok(warnings.some((line) => /createUserSchema is empty\. POST and PUT answer 501 until you add fields in src\/validations\/user\.validation\.js/.test(line)));
});

test('TypeScript projects get .ts validation files', (t) => {
  captureLogs(t);
  captureWarnings(t);
  const cwd = makeProject(t, { 'tsconfig.json': '{}', 'package.json': { dependencies: { zod: '^4.0.0' } } });

  createValidation('user', { cwd });

  assert.ok(exists(cwd, 'validations/user.validation.ts'));
  assert.ok(exists(cwd, 'middlewares/validate.middleware.ts'));
});

test('standalone create:validation does not touch routes and explains how to apply it', async (t) => {
  const logs = captureLogs(t);
  captureWarnings(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });
  await createRoute('user', { cwd, mount: false });
  const routeBefore = read(cwd, 'routes/user.routes.js');

  createValidation('user', { cwd });

  assert.equal(read(cwd, 'routes/user.routes.js'), routeBefore);
  assert.ok(logs.some((line) => /router\.post\('\/', validate\(createUserSchema\), create\);/.test(line)));
});

test('create:resource creates the validation and applies it to the route', async (t) => {
  const logs = captureLogs(t);
  captureWarnings(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });

  await createResource('user', { cwd, install: false });

  assert.ok(exists(cwd, 'validations/user.validation.js'));
  assert.ok(exists(cwd, 'middlewares/validate.middleware.js'));
  assert.match(read(cwd, 'routes/user.routes.js'), /router\.post\('\/', validate\(createUserSchema\), create\);/);
  assert.ok(!logs.some((line) => /Apply it in your route file/.test(line)), 'resource routes are wired automatically');
});

test('the shared middleware is never overwritten, not even with --force', (t) => {
  const logs = captureLogs(t);
  captureWarnings(t);
  const cwd = makeProject(t, { 'package.json': esmPkg, 'middlewares/validate.middleware.js': '// my custom validate' });

  createValidation('user', { cwd });
  createValidation('product', { cwd, force: true });

  assert.equal(read(cwd, 'middlewares/validate.middleware.js'), '// my custom validate');
  assert.ok(!logs.some((line) => /Created shared middleware/.test(line)));
});

test('an existing validation file is protected unless --force is passed', (t) => {
  captureLogs(t);
  captureWarnings(t);
  const cwd = makeProject(t, { 'package.json': esmPkg, 'validations/user.validation.js': 'MY RULES' });

  assert.throws(() => createValidation('user', { cwd }), /Refusing to overwrite[\s\S]*validations\/user\.validation\.js/);
  assert.equal(read(cwd, 'validations/user.validation.js'), 'MY RULES');
  assert.ok(!exists(cwd, 'middlewares'));

  createValidation('user', { cwd, force: true });
  assert.match(read(cwd, 'validations/user.validation.js'), /createUserSchema/);
});

test('create:validation rejects unsafe names and writes nothing', (t) => {
  const cwd = makeProject(t, { 'package.json': esmPkg });
  for (const name of ['../evil', 'a/b', '.hidden']) {
    assert.throws(() => createValidation(name, { cwd }), /Invalid validation name/);
  }
  assert.deepEqual(fs.readdirSync(cwd), ['package.json']);
});

// ---- installing zod -------------------------------------------------------

test('zod is installed only when the project does not have it', (t) => {
  captureLogs(t);
  captureWarnings(t);
  const calls = [];
  const runNpm = (args, cwd) => calls.push({ args, cwd });

  const missing = makeProject(t, { 'package.json': { type: 'module' } });
  createValidation('user', { cwd: missing, runNpm });
  assert.deepEqual(calls, [{ args: ['install', 'zod@^4'], cwd: missing }]);

  const present = makeProject(t, { 'package.json': esmPkg });
  createValidation('user', { cwd: present, runNpm });
  const asDevDependency = makeProject(t, { 'package.json': { devDependencies: { zod: '^4.0.0' } } });
  createValidation('user', { cwd: asDevDependency, runNpm });
  assert.equal(calls.length, 1);
});

test('install can be skipped, and is never attempted without a package.json', (t) => {
  const logs = captureLogs(t);
  captureWarnings(t);
  const runNpm = () => assert.fail('npm must not run');

  createValidation('user', { cwd: makeProject(t, { 'package.json': {} }), runNpm, install: false });
  createValidation('user', { cwd: makeProject(t), runNpm });

  assert.ok(logs.some((line) => /Skipped installing zod\. Install it with: npm install zod@\^4/.test(line)));
  assert.ok(logs.some((line) => /No package\.json found\. Install zod .* npm install zod@\^4/.test(line)));
});

test('a failed install keeps the generated files and explains how to finish', (t) => {
  captureLogs(t);
  captureWarnings(t);
  const cwd = makeProject(t, { 'package.json': { type: 'module' } });
  const runNpm = () => {
    throw new Error('network down');
  };

  assert.throws(() => createValidation('user', { cwd, runNpm }), /files were created, but installing zod failed \(network down\)[\s\S]*npm install zod@\^4/);
  assert.ok(exists(cwd, 'validations/user.validation.js'));
  assert.ok(exists(cwd, 'middlewares/validate.middleware.js'));
});

test('ensurePackage reports what it did', (t) => {
  captureLogs(t);
  const run = () => {};
  assert.equal(ensurePackage(makeProject(t, { 'package.json': { dependencies: { zod: '4' } } }), 'zod', '^4', { run }), 'present');
  assert.equal(ensurePackage(makeProject(t, { 'package.json': {} }), 'zod', '^4', { run }), 'installed');
  assert.equal(ensurePackage(makeProject(t, { 'package.json': {} }), 'zod', '^4', { run, skip: true }), 'skipped');
  assert.equal(ensurePackage(makeProject(t), 'zod', '^4', { run }), 'no-package-json');
});
