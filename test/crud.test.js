const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeProject, captureLogs, assertValidEsm, assertValidCjs, read } = require('./helpers');
const controllerTemplate = require('../templates/controllerTemplate');
const routeTemplate = require('../templates/routeTemplate');
const modelTemplate = require('../templates/modelTemplate');
const createResource = require('../commands/createResource');
const createController = require('../commands/createController');

const HANDLERS = ['getAll', 'getById', 'create', 'update', 'remove'];
const esm = { moduleType: 'esm', importExt: '.js', database: 'MongoDB' };
const cjs = { moduleType: 'cjs', importExt: '', database: 'MongoDB' };
const ts = { moduleType: 'ts', importExt: '', database: 'MongoDB' };

function fakeResponse() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

/** Writes a generated ESM controller next to a hand-written fake model and imports it. */
async function loadController(t, database, modelSource) {
  const dir = makeProject(t, { 'package.json': { type: 'module' }, 'models/user.model.js': modelSource });
  const file = path.join(dir, 'controllers', 'user.controller.js');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, controllerTemplate('user', { ...esm, database, withModel: true }));
  return import(pathToFileURL(file).href);
}

const FAKE_STORE = `
const rows = new Map([['1', { id: '1', name: 'Ada' }]]);
export const calls = [];
`;
const FAKE_MONGOOSE_MODEL = `${FAKE_STORE}
export default {
  find: async () => [...rows.values()],
  findById: async (id) => rows.get(id) ?? null,
  create: async (data) => ({ id: '2', ...data }),
  findByIdAndUpdate: async (id, data, options) => { calls.push(options); return rows.has(id) ? { ...rows.get(id), ...data } : null; },
  findByIdAndDelete: async (id) => rows.get(id) ?? null,
};
`;
const FAKE_MYSQL_MODEL = `${FAKE_STORE}
export default {
  findAll: async () => [...rows.values()],
  findById: async (id) => rows.get(id) ?? null,
  create: async (data) => ({ id: '2', ...data }),
  update: async (id, data) => (rows.has(id) ? { ...rows.get(id), ...data } : null),
  remove: async (id) => rows.has(id),
};
`;

test('every controller variant defines all five CRUD handlers', () => {
  for (const withModel of [true, false]) {
    for (const database of ['MongoDB', 'MySQL']) {
      const esmCode = controllerTemplate('user', { ...esm, database, withModel });
      assertValidEsm(esmCode);
      for (const handler of HANDLERS) assert.match(esmCode, new RegExp(`^export const ${handler} = async`, 'm'));

      const cjsCode = controllerTemplate('user', { ...cjs, database, withModel });
      assertValidCjs(cjsCode);
      assert.match(cjsCode, /module\.exports = \{ getAll, getById, create, update, remove \};/);

      const tsCode = controllerTemplate('user', { ...ts, database, withModel });
      for (const handler of HANDLERS) {
        const request = ['getById', 'update', 'remove'].includes(handler) ? 'Request<\\{ id: string \\}>' : 'Request';
        assert.match(tsCode, new RegExp(`^export const ${handler} = async \\(req: ${request}, res: Response\\)`, 'm'));
      }
    }
  }
});

test('route template wires all five handlers to REST endpoints', () => {
  for (const project of [esm, cjs, ts]) {
    const code = routeTemplate('user', project);
    assert.match(code, /getAll, getById, create, update, remove/);
    assert.match(code, /router\.get\('\/', getAll\);/);
    assert.match(code, /router\.get\('\/:id', getById\);/);
    assert.match(code, /router\.post\('\/', create\);/);
    assert.match(code, /router\.put\('\/:id', update\);/);
    assert.match(code, /router\.delete\('\/:id', remove\);/);
  }
});

test('standalone controller handlers all answer 501 instead of hanging', async (t) => {
  const dir = makeProject(t, { 'package.json': { type: 'module' } });
  const file = path.join(dir, 'user.controller.js');
  fs.writeFileSync(file, controllerTemplate('user', esm));
  const controller = await import(pathToFileURL(file).href);

  for (const handler of HANDLERS) {
    const res = fakeResponse();
    await controller[handler]({ params: { id: '1' }, body: {} }, res);
    assert.equal(res.statusCode, 501, handler);
  }
});

for (const [database, modelSource] of [['MongoDB', FAKE_MONGOOSE_MODEL], ['MySQL', FAKE_MYSQL_MODEL]]) {
  test(`resource controller performs CRUD through the ${database} model`, async (t) => {
    const controller = await loadController(t, database, modelSource);
    const call = async (handler, req) => {
      const res = fakeResponse();
      await controller[handler]({ params: {}, body: {}, ...req }, res);
      return res;
    };

    const all = await call('getAll');
    assert.equal(all.statusCode, 200);
    assert.deepEqual(all.body, [{ id: '1', name: 'Ada' }]);

    const one = await call('getById', { params: { id: '1' } });
    assert.equal(one.statusCode, 200);
    assert.equal(one.body.name, 'Ada');

    const created = await call('create', { body: { name: 'Grace' } });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.body, { id: '2', name: 'Grace' });

    const updated = await call('update', { params: { id: '1' }, body: { name: 'Ada L.' } });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.name, 'Ada L.');

    const removed = await call('remove', { params: { id: '1' } });
    assert.equal(removed.statusCode, 200);
    assert.match(removed.body.message, /User deleted/);
  });

  test(`resource controller answers 404 for a missing ${database} record`, async (t) => {
    const controller = await loadController(t, database, modelSource);
    for (const handler of ['getById', 'update', 'remove']) {
      const res = fakeResponse();
      await controller[handler]({ params: { id: 'missing' }, body: {} }, res);
      assert.equal(res.statusCode, 404, handler);
      assert.deepEqual(res.body, { message: 'User not found' });
    }
  });
}

test('Mongoose update returns the updated document and runs validators', async (t) => {
  const dir = makeProject(t, { 'package.json': { type: 'module' }, 'models/user.model.js': FAKE_MONGOOSE_MODEL });
  const file = path.join(dir, 'controllers', 'user.controller.js');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, controllerTemplate('user', { ...esm, withModel: true }));
  const controller = await import(pathToFileURL(file).href);
  const { calls } = await import(pathToFileURL(path.join(dir, 'models', 'user.model.js')).href);

  await controller.update({ params: { id: '1' }, body: {} }, fakeResponse());
  assert.deepEqual(calls[0], { returnDocument: 'after', runValidators: true });
});

test('MySQL model exposes the five operations the controller calls', () => {
  for (const project of [esm, cjs, ts]) {
    const code = modelTemplate('order-item', { ...project, database: 'MySQL' });
    assert.match(code, /\{ findAll, findById, create, update, remove \};/);
    // Table and values are always passed as placeholders, never concatenated.
    assert.doesNotMatch(code, /\$\{|' \+/);
    assert.match(code, /INSERT INTO \?\? SET \?/);
    assert.match(code, /UPDATE \?\? SET \? WHERE id = \?/);
    assert.match(code, /DELETE FROM \?\? WHERE id = \?/);
  }
  assertValidEsm(modelTemplate('order-item', { ...esm, database: 'MySQL' }));
  assertValidCjs(modelTemplate('order-item', { ...cjs, database: 'MySQL' }));
});

test('create:resource links the controller to its model; create:controller does not', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': { type: 'module', dependencies: { mongoose: '^9.0.0' } } });

  await createResource('user-profile', { cwd, install: false });
  createController('audit', { cwd });

  const resource = read(cwd, 'controllers/user-profile.controller.js');
  assert.match(resource, /import UserProfile from '\.\.\/models\/user-profile\.model\.js';/);
  assert.match(resource, /UserProfile\.find\(\)/);
  assert.doesNotMatch(resource, /not implemented/);

  const standalone = read(cwd, 'controllers/audit.controller.js');
  assert.doesNotMatch(standalone, /import /);
  assert.equal(standalone.match(/not implemented/g).length, 5);
});

test('a resource named like an Express type does not clash with the type import', () => {
  const code = controllerTemplate('request', { ...ts, withModel: true });
  assert.match(code, /import RequestModel from '\.\.\/models\/request\.model';/);
  assert.match(code, /RequestModel\.find\(\)/);
});
