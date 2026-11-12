const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeProject, assertValidCjs, assertValidEsm } = require('./helpers');
const modelTemplate = require('../templates/modelTemplate');
const routeTemplate = require('../templates/routeTemplate');
const controllerTemplate = require('../templates/controllerTemplate');
const middlewareTemplate = require('../templates/middlewareTemplate');

const esm = { moduleType: 'esm', importExt: '.js', ext: 'js', database: 'MongoDB' };
const cjs = { moduleType: 'cjs', importExt: '', ext: 'js', database: 'MongoDB' };
const ts = { moduleType: 'ts', importExt: '', ext: 'ts', database: 'MongoDB' };
const templates = { model: modelTemplate, route: routeTemplate, controller: controllerTemplate, middleware: middlewareTemplate };

function fakeResponse() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

for (const [kind, template] of Object.entries(templates)) {
  test(`${kind} template is valid ES module code and never uses CommonJS exports`, () => {
    for (const database of ['MongoDB', 'MySQL']) {
      const code = template('user-profile', { ...esm, database });
      assertValidEsm(code);
      assert.doesNotMatch(code, /module\.exports|require\(/);
    }
  });

  test(`${kind} template is valid CommonJS code and never uses ES module syntax`, () => {
    for (const database of ['MongoDB', 'MySQL']) {
      const code = template('user-profile', { ...cjs, database });
      assertValidCjs(code);
      assert.doesNotMatch(code, /^\s*(import|export)\s/m);
    }
  });

  test(`${kind} template for TypeScript uses ES module syntax`, () => {
    const code = template('user-profile', ts);
    assert.doesNotMatch(code, /module\.exports|require\(/);
    assert.match(code, /^export /m);
  });
}

test('model template turns hyphenated names into valid identifiers', () => {
  const code = modelTemplate('user-profile', esm);
  assert.match(code, /const UserProfileSchema = new mongoose\.Schema/);
  assert.match(code, /export default mongoose\.model\('UserProfile', UserProfileSchema\)/);
  assert.doesNotMatch(code, /user-profileSchema/);
});

test('model template follows the project database', () => {
  assert.match(modelTemplate('user', { ...esm, database: 'MongoDB' }), /from 'mongoose'/);
  assert.match(modelTemplate('user', { ...esm, database: null }), /from 'mongoose'/);

  const mysql = modelTemplate('user-profile', { ...esm, database: 'MySQL' });
  assert.doesNotMatch(mysql, /mongoose/);
  assert.match(mysql, /import \{ pool \} from '\.\.\/config\/db\.config\.js'/);
  assert.match(mysql, /const TABLE = 'user_profile'/);
});

test('route template imports the controller with the right extension per module type', () => {
  assert.match(routeTemplate('user', esm), /from '\.\.\/controllers\/user\.controller\.js'/);
  assert.match(routeTemplate('user', ts), /from '\.\.\/controllers\/user\.controller'/);
  assert.match(routeTemplate('user', cjs), /require\('\.\.\/controllers\/user\.controller'\)/);
  assert.match(routeTemplate('user', esm), /export default router/);
});

test('typed templates are only produced for TypeScript', () => {
  assert.match(controllerTemplate('user', ts), /req: Request, res: Response/);
  assert.match(middlewareTemplate('auth', ts), /next: NextFunction/);
  assert.doesNotMatch(controllerTemplate('user', esm), /Request/);
  assert.doesNotMatch(middlewareTemplate('auth', esm), /NextFunction/);
});

test('generated ESM controller loads and its handlers always send a response', async (t) => {
  const dir = makeProject(t, { 'package.json': { type: 'module' } });
  const file = path.join(dir, 'user.controller.js');
  fs.writeFileSync(file, controllerTemplate('user', esm));

  const controller = await import(pathToFileURL(file).href);
  for (const handler of ['getAll', 'create']) {
    const res = fakeResponse();
    await controller[handler]({}, res);
    assert.equal(res.statusCode, 501);
    assert.match(res.body.message, /not implemented/);
  }
});

test('generated CommonJS controller loads and its handlers always send a response', async (t) => {
  const dir = makeProject(t);
  const file = path.join(dir, 'user.controller.js');
  fs.writeFileSync(file, controllerTemplate('user', cjs));

  const controller = require(file);
  const res = fakeResponse();
  await controller.getAll({}, res);
  assert.equal(res.statusCode, 501);
  assert.equal(typeof controller.create, 'function');
});

test('generated middleware has a default export that calls next()', async (t) => {
  const esmDir = makeProject(t, { 'package.json': { type: 'module' } });
  const esmFile = path.join(esmDir, 'auth.middleware.js');
  fs.writeFileSync(esmFile, middlewareTemplate('auth', esm));
  const { default: esmMiddleware } = await import(pathToFileURL(esmFile).href);

  const cjsDir = makeProject(t);
  const cjsFile = path.join(cjsDir, 'auth.middleware.js');
  fs.writeFileSync(cjsFile, middlewareTemplate('auth', cjs));
  const cjsMiddleware = require(cjsFile);

  for (const middleware of [esmMiddleware, cjsMiddleware]) {
    let called = 0;
    middleware({}, {}, () => called++);
    assert.equal(called, 1);
  }
});
