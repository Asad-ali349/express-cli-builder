const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeProject, assertValidEsm, assertValidCjs } = require('./helpers');
const { errorsFile, errorMiddlewareFile } = require('../templates/errorTemplates');

const cjs = { moduleType: 'cjs', importExt: '', imports: { errors: './errors' } };

function fakeResponse() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

/** Loads the generated CommonJS errors + error middleware from a temp folder. */
function load(t) {
  const dir = makeProject(t);
  fs.writeFileSync(path.join(dir, 'errors.js'), errorsFile(cjs));
  fs.writeFileSync(path.join(dir, 'error.middleware.js'), errorMiddlewareFile(cjs));
  return { ...require(path.join(dir, 'errors.js')), ...require(path.join(dir, 'error.middleware.js')) };
}

function handle(errorHandler, error) {
  const res = fakeResponse();
  errorHandler(error, {}, res, () => {});
  return res;
}

test('error templates are valid in every module system', () => {
  assertValidEsm(errorsFile({ moduleType: 'esm' }));
  assertValidCjs(errorsFile(cjs));
  assertValidEsm(errorMiddlewareFile({ moduleType: 'esm', importExt: '.js', imports: { errors: '../utils/errors.js' } }));
  assertValidCjs(errorMiddlewareFile(cjs));
  assert.match(errorsFile({ moduleType: 'ts' }), /readonly statusCode: number;/);
  assert.match(errorMiddlewareFile({ moduleType: 'ts' }), /_next: NextFunction/);
});

test('AppError subclasses carry their status code', (t) => {
  const { AppError, NotFoundError, BadRequestError } = load(t);
  const notFound = new NotFoundError('User not found');
  assert.ok(notFound instanceof AppError);
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.name, 'NotFoundError');
  assert.equal(new BadRequestError().statusCode, 400);
  assert.equal(new NotFoundError().message, 'Resource not found');
});

test('errorHandler maps known errors to the right status', (t) => {
  const { errorHandler, NotFoundError, AppError } = load(t);

  const cases = [
    [new NotFoundError('User not found'), 404, { message: 'User not found' }],
    [new AppError(501, 'later'), 501, { message: 'later' }],
    [{ name: 'CastError', path: '_id' }, 400, { message: 'Invalid _id' }],
    [{ code: 11000 }, 409, { message: 'Duplicate value' }],
    [{ code: 'ER_DUP_ENTRY' }, 409, { message: 'Duplicate value' }],
    [{ type: 'entity.parse.failed', status: 400 }, 400, { message: 'Malformed JSON in request body' }],
    [{ status: 413, message: 'request entity too large' }, 413, { message: 'request entity too large' }],
  ];
  for (const [error, status, body] of cases) {
    const res = handle(errorHandler, error);
    assert.equal(res.statusCode, status, JSON.stringify(error));
    assert.deepEqual(res.body, body);
  }

  const validation = handle(errorHandler, {
    name: 'ValidationError',
    errors: { name: { path: 'name', message: 'Path `name` is required.' } },
  });
  assert.equal(validation.statusCode, 400);
  assert.deepEqual(validation.body, { message: 'Validation failed', errors: [{ path: 'name', message: 'Path `name` is required.' }] });
});

test('unexpected errors are 500, logged, and never shown to the client', (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  const { errorHandler } = load(t);
  const original = process.env.NODE_ENV;
  t.after(() => {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  });

  for (const env of [undefined, 'development', 'production']) {
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
    const res = handle(errorHandler, new Error("You have an error in your SQL syntax near ''"));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: 'Internal server error' }, `NODE_ENV=${env}`);
  }
  assert.equal(logged.length, 3, 'the real error is still logged on the server');
  assert.match(String(logged[0][0].message), /SQL syntax/);
  assert.equal(handle(errorHandler, undefined).statusCode, 500);
});

test('notFound names the missing route', (t) => {
  const { notFound } = load(t);
  const res = fakeResponse();
  notFound({ method: 'GET', originalUrl: '/api/nope' }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: 'Route GET /api/nope not found' });
});

test('the logger is used instead of console when the project has one', () => {
  const code = errorMiddlewareFile({ moduleType: 'esm', importExt: '.js', useLogger: true, imports: { errors: '../errors/app-error.js', logger: '../utils/logger.js' } });
  assert.match(code, /import \{ logger \} from '\.\.\/utils\/logger\.js';/);
  assert.match(code, /logger\.error\(\{ err: error \}, message\)/);
  assert.doesNotMatch(code, /console\.error/);
});
