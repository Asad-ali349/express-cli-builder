const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeProject, captureLogs, read, exists } = require('./helpers');
const createModel = require('../commands/createModel');
const createRoute = require('../commands/createRoute');
const createController = require('../commands/createController');
const createMiddleware = require('../commands/createMiddleware');
const createResource = require('../commands/createResource');
const { detectProject } = require('../lib/project');

const esmPkg = { type: 'module', dependencies: { mongoose: '^9.0.0' } };

test('detectProject recognises layout, language, module type and database', (t) => {
  const plain = makeProject(t);
  assert.deepEqual(
    { ...detectProject(plain), cwd: undefined },
    { cwd: undefined, baseDir: plain, moduleType: 'cjs', database: null, structure: 'small', features: [], apiPrefix: '', ext: 'js', importExt: '' }
  );

  const esm = makeProject(t, { 'package.json': esmPkg, 'src/app.js': '' });
  const esmInfo = detectProject(esm);
  assert.equal(esmInfo.baseDir, path.join(esm, 'src'));
  assert.equal(esmInfo.moduleType, 'esm');
  assert.equal(esmInfo.importExt, '.js');
  assert.equal(esmInfo.database, 'MongoDB');

  const ts = makeProject(t, { 'tsconfig.json': '{}', 'package.json': { dependencies: { mysql2: '^3.0.0' } } });
  const tsInfo = detectProject(ts);
  assert.equal(tsInfo.moduleType, 'ts');
  assert.equal(tsInfo.ext, 'ts');
  assert.equal(tsInfo.database, 'MySQL');
});

test('detectProject ignores a file named src and a corrupt package.json', (t) => {
  const dir = makeProject(t, { src: 'not a directory', 'package.json': '{ broken' });
  const info = detectProject(dir);
  assert.equal(info.baseDir, dir);
  assert.equal(info.moduleType, 'cjs');
});

test('each create command writes into its own folder at the project root', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });

  await createModel('user', { cwd });
  await createRoute('user', { cwd });
  createController('user', { cwd });
  createMiddleware('auth', { cwd });

  assert.ok(exists(cwd, 'models/user.model.js'));
  assert.ok(exists(cwd, 'routes/user.routes.js'));
  assert.ok(exists(cwd, 'controllers/user.controller.js'));
  assert.ok(exists(cwd, 'middlewares/auth.middleware.js'));
});

test('create commands use the src folder when it exists', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': esmPkg, 'src/app.js': '' });

  await createResource('product', { cwd, install: false });

  assert.ok(exists(cwd, 'src/models/product.model.js'));
  assert.ok(exists(cwd, 'src/routes/product.routes.js'));
  assert.ok(exists(cwd, 'src/controllers/product.controller.js'));
  assert.ok(!exists(cwd, 'models'));
});

test('TypeScript projects get .ts files for every kind, including middleware', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'tsconfig.json': '{}', 'package.json': { dependencies: { mongoose: '^9.0.0' } } });

  await createResource('product', { cwd, install: false });
  createMiddleware('auth', { cwd });

  for (const file of ['models/product.model.ts', 'routes/product.routes.ts', 'controllers/product.controller.ts', 'middlewares/auth.middleware.ts']) {
    assert.ok(exists(cwd, file), `${file} should exist`);
  }
  assert.ok(!exists(cwd, 'middlewares/auth.middleware.js'));
  assert.match(read(cwd, 'middlewares/auth.middleware.ts'), /NextFunction/);
});

test('generated code matches the module system of the project', async (t) => {
  captureLogs(t);
  const esm = makeProject(t, { 'package.json': esmPkg });
  const cjs = makeProject(t, { 'package.json': { dependencies: { mongoose: '^9.0.0' } } });

  await createResource('user', { cwd: esm, install: false });
  await createResource('user', { cwd: cjs, install: false });

  assert.match(read(esm, 'models/user.model.js'), /export default mongoose\.model/);
  assert.match(read(cjs, 'models/user.model.js'), /module\.exports = mongoose\.model/);
  assert.match(read(cjs, 'routes/user.routes.js'), /module\.exports = router/);
});

test('create:model generates a MySQL model in a MySQL project', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': { type: 'module', dependencies: { mysql2: '^3.0.0' } } });

  await createModel('order-item', { cwd });

  const model = read(cwd, 'models/order-item.model.js');
  assert.doesNotMatch(model, /mongoose/);
  assert.match(model, /const TABLE = 'order_item'/);
});

test('create:model without a database refuses to guess when there is no terminal', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': { type: 'module' } });

  await assert.rejects(() => createModel('user', { cwd }), /This project has no database yet\. Pass --database MongoDB or --database MySQL\./);
  assert.deepEqual(fs.readdirSync(cwd), ['package.json']);
});

test('create:route tells the user how to mount the route', async (t) => {
  const logs = captureLogs(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });

  await createRoute('user-profile', { cwd });

  const output = logs.join('\n');
  assert.match(output, /import userProfileRoutes from '\.\/routes\/user-profile\.routes\.js';/);
  assert.match(output, /app\.use\('\/user-profile', userProfileRoutes\);/);
});

test('an existing file is never overwritten without --force', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': esmPkg, 'models/user.model.js': 'MY HAND-WRITTEN CODE' });

  await assert.rejects(() => createModel('user', { cwd }), /Refusing to overwrite[\s\S]*models\/user\.model\.js[\s\S]*--force/);
  assert.equal(read(cwd, 'models/user.model.js'), 'MY HAND-WRITTEN CODE');
});

test('--force overwrites an existing file', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': esmPkg, 'models/user.model.js': 'MY HAND-WRITTEN CODE' });

  await createModel('user', { cwd, force: true });

  assert.match(read(cwd, 'models/user.model.js'), /mongoose\.model\('User'/);
});

test('create:resource writes nothing when any one of its files already exists', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': esmPkg, 'controllers/user.controller.js': 'KEEP ME' });

  await assert.rejects(() => createResource('user', { cwd, install: false }), /Refusing to overwrite/);

  assert.equal(read(cwd, 'controllers/user.controller.js'), 'KEEP ME');
  assert.ok(!exists(cwd, 'models/user.model.js'));
  assert.ok(!exists(cwd, 'routes/user.routes.js'));
});

test('names that would escape the project directory are rejected and write nothing', async (t) => {
  captureLogs(t);
  const root = makeProject(t, { 'project/package.json': esmPkg });
  const cwd = path.join(root, 'project');
  const commands = [createModel, createRoute, createController, createMiddleware, createResource];

  for (const command of commands) {
    for (const name of ['../escaped', '../../escaped', 'sub/escaped', '/tmp/escaped']) {
      // Sync commands throw, createResource rejects; both must refuse the name.
      await assert.rejects(async () => command(name, { cwd }), /Invalid .* name/);
    }
  }
  assert.deepEqual(fs.readdirSync(root), ['project']);
  assert.deepEqual(fs.readdirSync(cwd), ['package.json']);
});

test('hyphenated resource names keep the file name and produce valid identifiers', async (t) => {
  captureLogs(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });

  await createResource('user-profile', { cwd, install: false });

  assert.match(read(cwd, 'models/user-profile.model.js'), /const UserProfileSchema/);
  assert.match(read(cwd, 'routes/user-profile.routes.js'), /user-profile\.controller\.js/);
});
