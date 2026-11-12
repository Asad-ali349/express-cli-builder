const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { makeProject, captureLogs, assertValidEsm, read, exists } = require('./helpers');
const { scaffold, buildFiles, getInstallCommands, normalizeOptions, FEATURE_KEYS } = require('../lib/init');
const { targetFile, resolveModule, importSpecifier, sharedFile } = require('../lib/layout');
const { detectProject } = require('../lib/project');
const { addToRegistry } = require('../lib/mount');
const serviceTemplate = require('../templates/serviceTemplate');
const createResource = require('../commands/createResource');
const createModel = require('../commands/createModel');
const createMiddleware = require('../commands/createMiddleware');
const createRoute = require('../commands/createRoute');
const createService = require('../commands/createService');
const createValidation = require('../commands/createValidation');

const ALL = [...FEATURE_KEYS];
const large = (overrides = {}) => ({ size: 'large', language: 'TypeScript', database: 'MongoDB', features: [], ...overrides });
const paths = (options) => buildFiles({ cwd: '/work/shop-api', ...options }).map((file) => file.path).sort();
const silence = (t) => {
  captureLogs(t);
  t.mock.method(console, 'warn', () => {});
};

/** A scaffolded Large project with zod already listed, so nothing is installed. */
function largeProject(t, overrides = {}) {
  const cwd = makeProject(t);
  scaffold({ cwd, ...large(overrides) });
  const pkg = JSON.parse(read(cwd, 'package.json'));
  pkg.dependencies = { mongoose: '^9.0.0', zod: '^4.0.0' };
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg));
  return cwd;
}

// ---- init: Large projects --------------------------------------------------

test('Large projects always use src and get the modular core, with no extras by default', () => {
  assert.equal(normalizeOptions({ size: 'large', useSrc: false }).useSrc, true);
  assert.deepEqual(paths(large()), [
    '.env',
    '.gitignore',
    'package.json',
    'src/app.ts',
    'src/common/errors/app-error.ts',
    'src/common/middlewares/error.middleware.ts',
    'src/config/db.config.ts',
    'src/routes.ts',
    'src/server.ts',
    'tsconfig.json',
  ]);
});

test('each extra adds only its own files', () => {
  const base = new Set(paths(large()));
  const added = (feature) => paths(large({ features: [feature] })).filter((file) => !base.has(file));

  assert.deepEqual(added('env'), ['src/config/env.ts']);
  assert.deepEqual(added('logger'), ['src/common/utils/logger.ts']);
  assert.deepEqual(added('apiPrefix'), []);
  assert.deepEqual(added('security'), []);
  assert.deepEqual(added('testing'), ['src/app.test.ts']);
  assert.deepEqual(added('lint'), ['.prettierignore', '.prettierrc', 'eslint.config.mjs']);
  assert.deepEqual(added('swagger'), ['src/docs.ts']);
  assert.deepEqual(added('docker'), ['.dockerignore', 'Dockerfile', 'docker-compose.yml']);
});

test('each extra installs only its own packages', () => {
  const flat = (features, language = 'TypeScript') => getInstallCommands(large({ features, language })).flat().join(' ');
  const none = flat([]);
  for (const pkg of ['zod', 'pino', 'helmet', 'rate-limit', 'vitest', 'supertest', 'eslint', 'prettier', 'swagger']) {
    assert.doesNotMatch(none, new RegExp(pkg), `${pkg} must not be installed without its extra`);
  }
  assert.match(flat(['env']), /zod@\^4/);
  assert.match(flat(['logger']), /pino@\^10 pino-http@\^11/);
  assert.match(flat(['security']), /helmet@\^8 express-rate-limit@\^8/);
  assert.match(flat(['testing']), /vitest@\^3 supertest@\^7 @types\/supertest@\^7/);
  assert.doesNotMatch(flat(['testing'], 'JavaScript'), /@types/);
  assert.match(flat(['lint']), /typescript-eslint@\^8/);
  assert.doesNotMatch(flat(['lint'], 'JavaScript'), /typescript-eslint/);
  assert.match(flat(['swagger']), /swagger-ui-express@\^5.*@types\/swagger-ui-express@\^4/);
  assert.equal(flat(['docker']), none);
  assert.equal(flat(['apiPrefix']), none);
});

test('extras are only accepted for Large projects and must be known', () => {
  assert.deepEqual(normalizeOptions({ size: 'small', features: ['env'] }).features, []);
  assert.throws(() => normalizeOptions({ size: 'large', features: ['kafka'] }), /Unknown extra\(s\): kafka/);
  assert.deepEqual(normalizeOptions({ size: 'large', features: ['docker', 'env'] }).features, ['env', 'docker']);
});

test('Large package.json carries the marker, scripts and entry point', () => {
  const pkgOf = (options) => JSON.parse(buildFiles({ cwd: '/work/shop-api', ...options }).find((f) => f.path === 'package.json').content);

  const ts = pkgOf(large({ features: ALL }));
  assert.deepEqual(ts.expressCli, { structure: 'modular', features: ALL });
  assert.equal(ts.main, 'dist/server.js');
  assert.equal(ts.scripts.dev, 'tsx watch src/server.ts');
  assert.equal(ts.scripts.test, 'vitest run');
  assert.equal(ts.scripts.lint, 'eslint .');
  assert.equal(ts.type, undefined);

  const js = pkgOf(large({ language: 'JavaScript' }));
  assert.equal(js.type, 'module');
  assert.equal(js.scripts.start, 'node src/server.js');
  assert.deepEqual(js.expressCli, { structure: 'modular', features: [] });

  assert.equal(pkgOf({ size: 'small' }).expressCli, undefined, 'Small projects have no marker');
});

for (const language of ['JavaScript', 'TypeScript']) {
  for (const database of ['MongoDB', 'MySQL', null]) {
    for (const features of [[], ALL]) {
      test(`Large ${language}, ${database || 'no database'}, ${features.length ? 'all extras' : 'no extras'}: generated JS is valid`, () => {
        const files = buildFiles({ cwd: '/work/shop-api', ...large({ language, database, features }) });
        const app = files.find((file) => /^src\/app\.(js|ts)$/.test(file.path)).content;
        const server = files.find((file) => /^src\/server\./.test(file.path)).content;

        assert.match(app, /^export default app;$/m);
        assert.match(app, /app\.use\(notFound\);\napp\.use\(errorHandler\);/);
        assert.equal(/connectDB/.test(server), Boolean(database));
        assert.equal(/app\.use\('\/api\/v1', routes\)/.test(app), features.includes('apiPrefix'));
        assert.equal(/helmet\(\)/.test(app), features.includes('security'));
        assert.equal(/pinoHttp/.test(app), features.includes('logger'));
        assert.equal(/api-docs/.test(app), features.includes('swagger'));
        assert.equal(/from '\.\/config\/env/.test(server), features.includes('env'));

        if (language === 'JavaScript') {
          for (const file of files.filter((f) => f.path.endsWith('.js'))) assertValidEsm(file.content);
          assert.match(app, /from '\.\/routes\.js'/);
        } else {
          assert.doesNotMatch(app, /\.js'/);
        }
      });
    }
  }
}

test('.env validation lists exactly the variables of the chosen database', () => {
  const envOf = (database) => buildFiles(large({ database, features: ['env'] })).find((f) => f.path === 'src/config/env.ts').content;
  assert.match(envOf('MongoDB'), /CONNECTION_URL: z\.string\(\)\.min\(1\)/);
  assert.doesNotMatch(envOf('MongoDB'), /DB_HOST/);
  assert.match(envOf('MySQL'), /DB_HOST: z\.string\(\)\.min\(1\)/);
  assert.doesNotMatch(envOf(null), /CONNECTION_URL|DB_HOST/);

  const dbConfig = buildFiles(large({ features: ['env'] })).find((f) => f.path === 'src/config/db.config.ts').content;
  assert.match(dbConfig, /import \{ env \} from '\.\/env';/);
  assert.match(dbConfig, /env\.CONNECTION_URL/);
});

test('TypeScript Large projects keep tests out of the build only when Testing is chosen', () => {
  const tsconfig = (features) => JSON.parse(buildFiles(large({ features })).find((f) => f.path === 'tsconfig.json').content);
  assert.deepEqual(tsconfig(['testing']).exclude, ['node_modules', 'dist', 'src/**/*.test.ts']);
  assert.deepEqual(tsconfig([]).exclude, ['node_modules', 'dist']);
  assert.equal(tsconfig([]).compilerOptions.rootDir, './src');
});

test('docker-compose adds the chosen database service', () => {
  const compose = (database) => buildFiles({ cwd: '/w/shop-api', ...large({ database, features: ['docker'] }) }).find((f) => f.path === 'docker-compose.yml').content;
  assert.match(compose('MongoDB'), /image: mongo:8/);
  assert.match(compose('MongoDB'), /CONNECTION_URL: mongodb:\/\/mongo:27017\/shop_api/);
  assert.match(compose('MySQL'), /image: mysql:8\.4/);
  assert.doesNotMatch(compose(null), /mongo|mysql/);

  const dockerfile = (language) => buildFiles(large({ language, features: ['docker'] })).find((f) => f.path === 'Dockerfile').content;
  assert.match(dockerfile('TypeScript'), /RUN npm run build[\s\S]*CMD \["node", "dist\/server\.js"\]/);
  assert.match(dockerfile('JavaScript'), /CMD \["node", "src\/server\.js"\]/);
});

// ---- layout ----------------------------------------------------------------

test('targetFile follows the small, common and module rules', (t) => {
  const smallProject = detectProject(makeProject(t, { 'src/app.js': '' }));
  assert.equal(path.relative(smallProject.cwd, targetFile(smallProject, 'model', 'user')), 'src/models/user.model.js');

  const cwd = largeProject(t);
  const project = detectProject(cwd);
  const rel = (file) => path.relative(cwd, file);
  assert.equal(rel(targetFile(project, 'model', 'audit')), 'src/common/models/audit.model.ts');
  assert.equal(rel(targetFile(project, 'model', 'address', 'user')), 'src/modules/user/models/address.model.ts');
  assert.equal(rel(targetFile(project, 'route', 'user', 'user')), 'src/modules/user/user.routes.ts');
  assert.equal(rel(targetFile(project, 'test', 'user', 'user')), 'src/modules/user/tests/user.test.ts');
  assert.equal(rel(sharedFile(project, 'validateMiddleware')), 'src/common/middlewares/validate.middleware.ts');
});

test('resolveModule rejects --module in small projects and unknown modules', (t) => {
  const smallProject = detectProject(makeProject(t));
  assert.equal(resolveModule(smallProject, undefined), null);
  assert.throws(() => resolveModule(smallProject, 'user'), /--module only works in modular projects/);

  const project = detectProject(largeProject(t));
  assert.throws(() => resolveModule(project, 'ghost'), /Module "ghost" does not exist\. Create it first with: express create:resource ghost/);
  assert.throws(() => resolveModule(project, '../x'), /Invalid module name/);
});

test('importSpecifier builds relative imports with the right extension', () => {
  const esm = { importExt: '.js' };
  assert.equal(importSpecifier('/p/src/modules/user/user.routes.js', '/p/src/modules/user/controllers/user.controller.js', esm), './controllers/user.controller.js');
  assert.equal(importSpecifier('/p/src/modules/user/services/user.service.ts', '/p/src/common/errors/app-error.ts', { importExt: '' }), '../../../common/errors/app-error');
});

// ---- create:* in Large projects --------------------------------------------

test('create:resource builds a complete module wired through src/routes', async (t) => {
  silence(t);
  const cwd = largeProject(t, { features: ['apiPrefix'] });

  await createResource('order-item', { cwd, install: false });

  const dir = 'src/modules/order-item';
  for (const file of ['order-item.routes.ts', 'controllers/order-item.controller.ts', 'services/order-item.service.ts', 'models/order-item.model.ts', 'validations/order-item.validation.ts']) {
    assert.ok(exists(cwd, dir, file), file);
  }
  assert.ok(!exists(cwd, dir, 'docs'), 'no docs without the Swagger extra');
  assert.ok(exists(cwd, 'src/common/middlewares/validate.middleware.ts'));

  const routes = read(cwd, 'src/routes.ts');
  assert.match(routes, /import orderItemRoutes from '\.\/modules\/order-item\/order-item\.routes';/);
  assert.match(routes, /router\.use\('\/order-item', orderItemRoutes\);\n\/\/ Module routes are added above this line/);

  const controller = read(cwd, dir, 'controllers/order-item.controller.ts');
  assert.match(controller, /import \* as orderItemService from '\.\.\/services\/order-item\.service';/);
  assert.doesNotMatch(controller, /OrderItem\.find|status\(404\)/, 'logic lives in the service');

  const service = read(cwd, dir, 'services/order-item.service.ts');
  assert.match(service, /from '\.\.\/\.\.\/\.\.\/common\/errors\/app-error'/);
  assert.match(service, /throw new NotFoundError\('OrderItem not found'\)/);

  const route = read(cwd, dir, 'order-item.routes.ts');
  assert.match(route, /from '\.\.\/\.\.\/common\/middlewares\/validate\.middleware'/);
  assert.match(route, /from '\.\/validations\/order-item\.validation'/);
});

test('a second resource is added to the registry without disturbing the first', async (t) => {
  silence(t);
  const cwd = largeProject(t);
  await createResource('user', { cwd, install: false });
  await createResource('product', { cwd, install: false });
  await createResource('user', { cwd, install: false, force: true });

  const routes = read(cwd, 'src/routes.ts');
  assert.equal(routes.match(/router\.use\('\/user'/g).length, 1);
  assert.match(routes, /router\.use\('\/user', userRoutes\);\nrouter\.use\('\/product', productRoutes\);/);
});

test('create:resource asks about docs and tests only when the project has those extras', async (t) => {
  silence(t);
  const questions = [];
  const ask = async (question, key) => {
    questions.push(key);
    return key === 'tests';
  };

  const plain = largeProject(t);
  await createResource('user', { cwd: plain, install: false, ask });
  assert.deepEqual(questions, []);

  const full = largeProject(t, { features: ['swagger', 'testing'] });
  await createResource('user', { cwd: full, install: false, ask });
  assert.deepEqual(questions, ['docs', 'tests']);
  assert.ok(!exists(full, 'src/modules/user/docs'), 'answered no to docs');
  assert.ok(exists(full, 'src/modules/user/tests/user.test.ts'), 'answered yes to tests');
  assert.doesNotMatch(read(full, 'src/docs.ts'), /userDocs/);
});

test('--docs and --tests flags answer the questions without asking', async (t) => {
  silence(t);
  const cwd = largeProject(t, { features: ['swagger', 'testing', 'apiPrefix'] });
  const ask = () => assert.fail('must not ask when flags are given');

  await createResource('user', { cwd, install: false, ask, docs: true, tests: false });

  assert.ok(exists(cwd, 'src/modules/user/docs/user.docs.ts'));
  assert.ok(!exists(cwd, 'src/modules/user/tests'));
  const docs = read(cwd, 'src/docs.ts');
  assert.match(docs, /^import \{ userDocs \} from '\.\/modules\/user\/docs\/user\.docs';\n\n/);
  assert.match(docs, / {2}userDocs,\n {2}\/\/ Module docs are added above this line/);
  assert.match(docs, /servers: \[\{ url: '\/api\/v1' \}\]/);
});

test('without a terminal the docs/tests questions default to no', async (t) => {
  const logs = captureLogs(t);
  t.mock.method(console, 'warn', () => {});
  const cwd = largeProject(t, { features: ['swagger'] });
  const original = process.stdin.isTTY;
  process.stdin.isTTY = false;
  t.after(() => {
    process.stdin.isTTY = original;
  });

  await createResource('user', { cwd, install: false });

  assert.ok(!exists(cwd, 'src/modules/user/docs'));
  assert.ok(logs.some((line) => /pass --docs to include it/.test(line)));
});

test('the generated module test targets the mocked service and the prefixed route', async (t) => {
  silence(t);
  const cwd = largeProject(t, { features: ['testing', 'apiPrefix'] });
  await createResource('user', { cwd, install: false, tests: true });

  const spec = read(cwd, 'src/modules/user/tests/user.test.ts');
  assert.match(spec, /import app from '\.\.\/\.\.\/\.\.\/app';/);
  assert.match(spec, /vi\.mock\('\.\.\/services\/user\.service', /);
  assert.match(spec, /request\(app\)\.get\('\/api\/v1\/user'\)/);
});

test('single commands go to common/ unless --module is given', async (t) => {
  silence(t);
  const cwd = largeProject(t);

  await createModel('audit', { cwd });
  createService('billing', { cwd });
  createValidation('pagination', { cwd });
  assert.ok(exists(cwd, 'src/common/models/audit.model.ts'));
  assert.ok(exists(cwd, 'src/common/services/billing.service.ts'));
  assert.ok(exists(cwd, 'src/common/validations/pagination.validation.ts'));

  fs.mkdirSync(path.join(cwd, 'src/modules/user'), { recursive: true });
  await createModel('address', { cwd, module: 'user' });
  createMiddleware('owner', { cwd, module: 'user' });
  await createRoute('admin', { cwd, module: 'user' });
  assert.ok(exists(cwd, 'src/modules/user/models/address.model.ts'));
  assert.ok(exists(cwd, 'src/modules/user/middlewares/owner.middleware.ts'));
  assert.ok(exists(cwd, 'src/modules/user/admin.routes.ts'));
  assert.match(read(cwd, 'src/routes.ts'), /router\.use\('\/admin', adminRoutes\);/);

  await assert.rejects(() => createModel('x', { cwd, module: 'ghost' }), /Module "ghost" does not exist/);
  assert.ok(!exists(cwd, 'src/modules/ghost'));
});

test('services are refused in Small projects, and --module too', async (t) => {
  silence(t);
  const cwd = makeProject(t, { 'package.json': { type: 'module' } });
  assert.throws(() => createService('billing', { cwd }), /Services are only used in modular projects/);
  await assert.rejects(() => createModel('user', { cwd, module: 'user' }), /--module only works in modular projects/);
  assert.deepEqual(fs.readdirSync(cwd), ['package.json']);
});

test('a standalone service links to an existing model, otherwise it is a stub', async (t) => {
  silence(t);
  const cwd = largeProject(t);
  createService('billing', { cwd });
  const stub = read(cwd, 'src/common/services/billing.service.ts');
  assert.match(stub, /throw new AppError\(501, 'findAll billing: not implemented'\)/);
  assert.match(stub, /async \(_id: string\)/, 'unused stub arguments are prefixed for linters');

  await createModel('invoice', { cwd });
  createService('invoice', { cwd });
  assert.match(read(cwd, 'src/common/services/invoice.service.ts'), /import InvoiceModel from '\.\.\/models\/invoice\.model';/);
});

test('service template covers MySQL models too', () => {
  const code = serviceTemplate('order', { moduleType: 'esm', importExt: '.js', database: 'MySQL', withModel: true });
  assertValidEsm(code);
  assert.match(code, /OrderModel\.findAll\(\)/);
  assert.match(code, /const deleted = await OrderModel\.remove\(id\);/);
});

// ---- registry --------------------------------------------------------------

test('addToRegistry needs the marker and is idempotent', () => {
  const snippet = { importPath: './a', importLine: "import a from './a';", entryLine: 'a,' };
  assert.equal(addToRegistry('const x = [];\n', snippet), null);
  const source = "const list = [\n  // Module docs are added above this line by \"express create:resource\".\n];\n";
  const once = addToRegistry(source, snippet);
  assert.equal(addToRegistry(once, snippet), once);
  assert.match(once, /^import a from '\.\/a';\n\nconst list = \[\n {2}a,\n/);
});

// ---- generated code really runs --------------------------------------------

test('a generated Large JavaScript module serves CRUD through the real app', async (t) => {
  silence(t);
  const cwd = makeProject(t);
  scaffold({ cwd, ...large({ language: 'JavaScript', database: null, features: ['apiPrefix'] }) });
  // The CLI's own express and zod stand in for an npm install.
  fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(cwd, 'node_modules'));
  const pkg = JSON.parse(read(cwd, 'package.json'));
  pkg.dependencies = { zod: '^4.0.0' };
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg));
  await createResource('note', { cwd, install: false, database: 'MongoDB' });

  // The service is linked to a mongoose model; swap in an in-memory model to
  // exercise routes, validation, service and errors without a database.
  fs.writeFileSync(
    path.join(cwd, 'src/modules/note/models/note.model.js'),
    `const rows = new Map([['1', { id: '1', text: 'hi' }]]);
export default {
  find: async () => [...rows.values()],
  findById: async (id) => rows.get(id) ?? null,
  create: async (data) => ({ id: '2', ...data }),
  findByIdAndUpdate: async (id, data) => (rows.has(id) ? { ...rows.get(id), ...data } : null),
  findByIdAndDelete: async (id) => rows.get(id) ?? null,
};
`
  );

  const { default: app } = await import(pathToFileURL(path.join(cwd, 'src/app.js')).href);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body });
    return { status: res.status, body: await res.json() };
  };

  assert.deepEqual(await call('GET', '/api/v1/note'), { status: 200, body: [{ id: '1', text: 'hi' }] });
  assert.equal((await call('GET', '/api/v1/note/1')).status, 200);
  assert.deepEqual(await call('GET', '/api/v1/note/9'), { status: 404, body: { message: 'Note not found' } });
  // The note validation schema is still empty, so writes are refused.
  assert.deepEqual(await call('POST', '/api/v1/note', '{"text":"x"}'), {
    status: 501,
    body: { message: 'POST /api/v1/note is not ready: its validation schema has no fields yet.' },
  });
  assert.deepEqual(await call('POST', '/api/v1/note', '{bad'), { status: 400, body: { message: 'Malformed JSON in request body' } });
  assert.deepEqual(await call('DELETE', '/api/v1/note/1'), { status: 200, body: { message: 'Note deleted' } });
  assert.equal((await call('GET', '/api/v1/nothing')).status, 404);
});
