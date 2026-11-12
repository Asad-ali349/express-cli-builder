// Tests for the fixes of the regression findings F1-F4.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeProject, captureLogs, assertValidEsm, assertValidCjs, read, exists } = require('./helpers');
const { scaffold, buildDbConfig } = require('../lib/init');
const { wireConnectDB } = require('../lib/database');
const createRoute = require('../commands/createRoute');
const createController = require('../commands/createController');
const createModel = require('../commands/createModel');
const createResource = require('../commands/createResource');
const routeTemplate = require('../templates/routeTemplate');
const modelTemplate = require('../templates/modelTemplate');
const moduleTestTemplate = require('../templates/moduleTestTemplate');

const esmPkg = { type: 'module', dependencies: { mongoose: '^9.0.0', zod: '^4.0.0' } };
const silence = (t) => {
  const logs = captureLogs(t);
  t.mock.method(console, 'warn', () => {});
  return logs;
};

// ---- F1: create:route without its controller ---------------------------------

test('F1: the route template can leave the controller parts commented out', () => {
  for (const project of [{ moduleType: 'esm', importExt: '.js' }, { moduleType: 'cjs', importExt: '' }]) {
    const code = routeTemplate('lonely', { ...project, withController: false });
    if (project.moduleType === 'esm') assertValidEsm(code);
    else assertValidCjs(code);
    assert.match(code, /^\/\/ (import|const) \{ getAll, getById, create, update, remove \}/m);
    assert.match(code, /^\/\/ router\.get\('\/', getAll\);$/m);
    assert.doesNotMatch(code, /^router\./m, 'no active route lines');
    assert.match(code, /express create:controller lonely/);
  }
});

test('F1: an existing controller means no question and a normal route', async (t) => {
  silence(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });
  createController('user', { cwd });
  await createRoute('user', { cwd, ask: () => assert.fail('must not ask') });
  assert.match(read(cwd, 'routes/user.routes.js'), /^router\.get\('\/', getAll\);$/m);
});

test('F1: answering yes creates the controller too', async (t) => {
  silence(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });
  const questions = [];
  await createRoute('lonely', { cwd, ask: (question) => (questions.push(question), true) });

  assert.deepEqual(questions, ['The lonely controller does not exist yet. Create it too?']);
  assert.ok(exists(cwd, 'controllers/lonely.controller.js'));
  assert.match(read(cwd, 'routes/lonely.routes.js'), /^router\.get\('\/', getAll\);$/m);
});

test('F1: answering no writes a commented route that is still mounted and keeps the app loading', async (t) => {
  const logs = silence(t);
  const cwd = makeProject(t, { 'package.json': { type: 'module' } });
  scaffold({ cwd, size: 'small', language: 'JavaScript', useSrc: false, database: null, force: true });
  fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(cwd, 'node_modules'));

  await createRoute('lonely', { cwd, ask: () => false });

  assert.ok(!exists(cwd, 'controllers/lonely.controller.js'));
  assert.match(read(cwd, 'routes/lonely.routes.js'), /^\/\/ import \{ getAll/m);
  assert.match(read(cwd, 'app.js'), /app\.use\('\/lonely', lonelyRoutes\);/);
  assert.ok(logs.some((line) => /Run "express create:controller lonely", then uncomment them/.test(line)));

  // The route file loads although the controller does not exist.
  const { default: router } = await import(pathToFileURL(path.join(cwd, 'routes/lonely.routes.js')).href);
  assert.equal(typeof router, 'function');
});

test('F1: without a terminal the default is no; --controller and --no-controller skip the question', async (t) => {
  const logs = silence(t);
  const original = process.stdin.isTTY;
  process.stdin.isTTY = false;
  t.after(() => {
    process.stdin.isTTY = original;
  });

  const noTty = makeProject(t, { 'package.json': esmPkg });
  await createRoute('a', { cwd: noTty });
  assert.ok(!exists(noTty, 'controllers/a.controller.js'));
  assert.ok(logs.some((line) => /pass --controller to include it/.test(line)));

  const flagged = makeProject(t, { 'package.json': esmPkg });
  await createRoute('b', { cwd: flagged, controller: true, ask: () => assert.fail('must not ask') });
  await createRoute('c', { cwd: flagged, controller: false, ask: () => assert.fail('must not ask') });
  assert.ok(exists(flagged, 'controllers/b.controller.js'));
  assert.ok(!exists(flagged, 'controllers/c.controller.js'));
});

test('F1: modular projects check the controller inside the module', async (t) => {
  const logs = silence(t);
  const cwd = makeProject(t);
  scaffold({ cwd, size: 'large', language: 'TypeScript', database: null, features: [] });
  fs.mkdirSync(path.join(cwd, 'src/modules/shop/controllers'), { recursive: true });

  await createRoute('admin', { cwd, module: 'shop', ask: () => false });
  assert.match(read(cwd, 'src/modules/shop/admin.routes.ts'), /^\/\/ import \{ getAll/m);
  assert.ok(logs.some((line) => /create:controller admin --module shop/.test(line)));

  createController('report', { cwd, module: 'shop' });
  await createRoute('report', { cwd, module: 'shop', ask: () => assert.fail('controller exists') });
  assert.match(read(cwd, 'src/modules/shop/report.routes.ts'), /^router\.get/m);
});

// ---- F2: MySQL model never runs empty INSERT / UPDATE --------------------------

test('F2: the MySQL model refuses empty inserts and skips empty updates', async (t) => {
  const dir = makeProject(t, { 'package.json': { type: 'module' } });
  const queries = [];
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(
    path.join(dir, 'config/db.config.js'),
    `export const pool = { query: async (sql, params) => { globalThis.__queries.push(sql); return sql.startsWith('SELECT') ? [[{ id: params[1], name: 'x' }]] : [{ insertId: 7, affectedRows: 1 }]; } };\n`
  );
  globalThis.__queries = queries;
  fs.mkdirSync(path.join(dir, 'models'));
  fs.writeFileSync(path.join(dir, 'models/order.model.js'), modelTemplate('order', { moduleType: 'esm', importExt: '.js', database: 'MySQL' }));
  const model = await import(pathToFileURL(path.join(dir, 'models/order.model.js')).href);

  await assert.rejects(() => model.create({}), /create\(\) needs at least one field/);
  assert.deepEqual(queries, [], 'no INSERT for empty data');

  const unchanged = await model.update(3, {});
  assert.deepEqual(unchanged, { id: 3, name: 'x' });
  assert.ok(queries.every((sql) => sql.startsWith('SELECT')), 'an empty update only reads');

  await model.create({ name: 'pen' });
  assert.ok(queries.some((sql) => sql === 'INSERT INTO ?? SET ?'));
});

test('F2: generated module tests mock validation so they do not depend on the schema', () => {
  const code = moduleTestTemplate('user', {
    moduleType: 'ts',
    importExt: '',
    imports: { service: '../services/user.service', app: '../../../app', validateMiddleware: '../../../common/middlewares/validate.middleware' },
  });
  assert.match(code, /vi\.mock\('\.\.\/\.\.\/\.\.\/common\/middlewares\/validate\.middleware', \(\) => \(\{\n {2}validate: \(\) => \(req, res, next\) => next\(\),/);
});

// ---- F3: a database is chosen when the project has none ------------------------

function noDbProject(t, size, language) {
  const cwd = makeProject(t);
  scaffold({ cwd, size, language, useSrc: size === 'large', database: null, features: size === 'large' ? ['env', 'docker'] : [] });
  return cwd;
}

test('F3: create:model asks for a database and sets it up in a Small project', async (t) => {
  const logs = silence(t);
  const cwd = noDbProject(t, 'small', 'TypeScript');
  const npmCalls = [];
  const asked = [];

  await createModel('audit', {
    cwd,
    ask: (question, key, choices) => (asked.push({ key, choices }), 'MySQL'),
    runNpm: (args) => npmCalls.push(args),
  });

  assert.deepEqual(asked, [{ key: 'database', choices: ['MongoDB', 'MySQL'] }]);
  assert.match(read(cwd, 'config/db.config.ts'), /export const pool = mysql\.createPool/);
  const app = read(cwd, 'app.ts');
  assert.match(app, /^import \{ connectDB \} from '\.\/config\/db\.config';$/m);
  assert.match(app, /const start = async \(\) => \{\n {2}await connectDB\(\);/);
  assert.match(read(cwd, '.env'), /^DB_HOST=localhost$/m);
  assert.match(read(cwd, 'models/audit.model.ts'), /import \{ pool \} from '\.\.\/config\/db\.config';/, 'the model matches the chosen database');
  assert.deepEqual(npmCalls, [['install', 'mysql2@^3']]);
  assert.ok(logs.some((line) => /Connected the database at startup in app\.ts/.test(line)));
});

test('F3: in a Large project the server, env schema and .env are updated', async (t) => {
  const logs = silence(t);
  const cwd = noDbProject(t, 'large', 'JavaScript');
  const pkg = JSON.parse(read(cwd, 'package.json'));
  pkg.dependencies = { zod: '^4.0.0' };
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg));

  await createResource('product', { cwd, database: 'mongodb', install: false });

  const server = read(cwd, 'src/server.js');
  assert.match(server, /^import \{ connectDB \} from '\.\/config\/db\.config\.js';$/m);
  assert.match(server, /await connectDB\(\);/);
  assert.match(read(cwd, 'src/config/db.config.js'), /import \{ env \} from '\.\/env\.js';[\s\S]*env\.CONNECTION_URL/);
  assert.match(read(cwd, 'src/config/env.js'), /PORT: z\.coerce[^\n]*\n {2}CONNECTION_URL: z\.string\(\)\.min\(1\),/);
  assert.match(read(cwd, '.env'), /^CONNECTION_URL=mongodb:\/\/127\.0\.0\.1:27017\//m);
  assert.match(read(cwd, 'src/modules/product/models/product.model.js'), /mongoose\.model\('Product'/);
  assert.ok(logs.some((line) => /Skipped installing mongoose/.test(line)));
  assert.ok(logs.some((line) => /docker-compose\.yml has no MongoDB service yet/.test(line)));
  for (const file of ['src/server.js', 'src/config/db.config.js', 'src/config/env.js']) assertValidEsm(read(cwd, file));
});

test('F3: without a terminal and without --database nothing is written', async (t) => {
  silence(t);
  const cwd = noDbProject(t, 'small', 'JavaScript');
  const before = fs.readdirSync(cwd).sort();
  const app = read(cwd, 'app.js');

  await assert.rejects(() => createModel('audit', { cwd }), /Pass --database MongoDB or --database MySQL/);
  await assert.rejects(() => createModel('audit', { cwd, database: 'Postgres' }), /Unknown database "Postgres"\. Use one of: MongoDB, MySQL/);

  assert.deepEqual(fs.readdirSync(cwd).sort(), before);
  assert.equal(read(cwd, 'app.js'), app);
});

test('F3: an existing model file is reported before any database setup happens', async (t) => {
  silence(t);
  const cwd = noDbProject(t, 'small', 'JavaScript');
  fs.mkdirSync(path.join(cwd, 'models'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'models/audit.model.js'), 'KEEP');

  await assert.rejects(() => createModel('audit', { cwd, database: 'MongoDB', install: false }), /Refusing to overwrite/);
  assert.ok(!exists(cwd, 'config/db.config.js'), 'no database setup when the command fails');
});

test('F3: an existing db.config and connectDB call are kept', async (t) => {
  const logs = silence(t);
  const cwd = noDbProject(t, 'small', 'JavaScript');
  fs.mkdirSync(path.join(cwd, 'config'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'config/db.config.js'), '// mine\n');

  await createModel('audit', { cwd, database: 'MongoDB', install: false });

  assert.equal(read(cwd, 'config/db.config.js'), '// mine\n');
  assert.ok(logs.some((line) => /Kept existing config\/db\.config\.js/.test(line)));

  const wired = read(cwd, 'app.js');
  assert.equal(wireConnectDB(wired, "import { connectDB } from './x';").status, 'already');
});

test('F3: projects that already have a database are not asked', async (t) => {
  silence(t);
  const cwd = makeProject(t, { 'package.json': esmPkg });
  await createModel('audit', { cwd, ask: () => assert.fail('must not ask') });
  assert.ok(exists(cwd, 'models/audit.model.js'));
  assert.ok(!exists(cwd, 'config'));
});

// ---- F4: wait for MongoDB indexes ---------------------------------------------

test('F4: the MongoDB config builds every model index before returning', async (t) => {
  const code = buildDbConfig({ database: 'MongoDB' });
  assert.match(code, /for \(const model of Object\.values\(mongoose\.models\)\)/);
  assert.match(code, /await model\.init\(\);/);
  assert.doesNotMatch(code, /syncIndexes/, 'syncIndexes would drop indexes that are not in the schema');

  // Run the generated connectDB against a fake mongoose.
  const dir = makeProject(t, { 'package.json': { type: 'module' } });
  const inits = [];
  fs.mkdirSync(path.join(dir, 'node_modules/mongoose'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules/mongoose/package.json'), '{"name":"mongoose","type":"module","main":"index.js"}');
  fs.writeFileSync(
    path.join(dir, 'node_modules/mongoose/index.js'),
    `export default {
  models: {
    Product: { modelName: 'Product', init: async () => { globalThis.__inits.push('Product'); } },
    Order: { modelName: 'Order', init: async () => { throw new Error('E11000 duplicate key'); } },
  },
  connect: async () => ({ connection: { host: 'fake' } }),
};
`
  );
  globalThis.__inits = inits;
  fs.writeFileSync(path.join(dir, 'db.config.js'), code);
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  t.mock.method(console, 'log', () => {});
  const original = process.env.CONNECTION_URL;
  process.env.CONNECTION_URL = 'mongodb://fake';
  t.after(() => {
    if (original === undefined) delete process.env.CONNECTION_URL;
    else process.env.CONNECTION_URL = original;
  });

  const { connectDB } = await import(pathToFileURL(path.join(dir, 'db.config.js')).href);
  await connectDB();

  assert.deepEqual(inits, ['Product']);
  assert.deepEqual(warnings, ['Could not build indexes for Order: E11000 duplicate key'], 'a failing index only warns');
});
