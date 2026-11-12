const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeProject, assertValidEsm, read, exists } = require('./helpers');
const {
  scaffold,
  buildFiles,
  buildPackageJson,
  buildTsconfig,
  buildEnv,
  buildAppFile,
  buildDbConfig,
  getInstallCommands,
  projectNameFrom,
} = require('../lib/init');

const combinations = [];
for (const language of ['TypeScript', 'JavaScript']) {
  for (const useSrc of [true, false]) {
    for (const database of ['MongoDB', 'MySQL', null]) {
      combinations.push({ language, useSrc, database });
    }
  }
}
const label = ({ language, useSrc, database }) => `${language}, ${useSrc ? 'src' : 'no src'}, ${database || 'no database'}`;

for (const combo of combinations) {
  test(`scaffold creates a consistent project: ${label(combo)}`, (t) => {
    const cwd = makeProject(t);
    scaffold({ ...combo, cwd });

    const ext = combo.language === 'TypeScript' ? 'ts' : 'js';
    const base = combo.useSrc ? 'src/' : '';
    const pkg = JSON.parse(read(cwd, 'package.json'));

    // The app file exists where the layout says it should.
    assert.ok(exists(cwd, `${base}app.${ext}`));
    assert.ok(exists(cwd, `${base}controllers`));
    assert.ok(exists(cwd, `${base}routes`));
    assert.ok(exists(cwd, '.env'));
    assert.match(read(cwd, '.gitignore'), /^\.env$/m);
    assert.match(read(cwd, '.gitignore'), /^node_modules\/$/m);

    // Every script points at a file that scaffold actually created.
    assert.ok(pkg.scripts.dev.endsWith(`${base}app.${ext}`), pkg.scripts.dev);
    assert.doesNotMatch(JSON.stringify(pkg.scripts), /nodemon|ts-node/);

    // Database files only when a database was chosen.
    assert.equal(exists(cwd, `${base}config/db.config.${ext}`), Boolean(combo.database));
    assert.equal(exists(cwd, `${base}models`), Boolean(combo.database));
    assert.equal(/connectDB/.test(read(cwd, `${base}app.${ext}`)), Boolean(combo.database));

    if (ext === 'ts') {
      const tsconfig = JSON.parse(read(cwd, 'tsconfig.json'));
      assert.equal(tsconfig.compilerOptions.rootDir, combo.useSrc ? './src' : '.');
      assert.equal(pkg.type, undefined);
      assert.equal(pkg.scripts.start, 'tsc && node dist/app.js');
    } else {
      assert.ok(!exists(cwd, 'tsconfig.json'));
      assert.equal(pkg.type, 'module');
      assert.equal(pkg.scripts.start, `node ${base}app.js`);
      assertValidEsm(read(cwd, `${base}app.js`));
      if (combo.database) assertValidEsm(read(cwd, `${base}config/db.config.js`));
    }
  });
}

test('scaffold refuses to overwrite an existing project and leaves it untouched', (t) => {
  const cwd = makeProject(t, {
    'package.json': '{"name":"my-real-app"}',
    'app.js': 'original app',
    '.env': 'SECRET=abc',
  });

  assert.throws(
    () => scaffold({ cwd, language: 'JavaScript', useSrc: false, database: null }),
    /Refusing to overwrite[\s\S]*package\.json[\s\S]*app\.js/
  );

  assert.equal(read(cwd, 'package.json'), '{"name":"my-real-app"}');
  assert.equal(read(cwd, 'app.js'), 'original app');
  assert.equal(read(cwd, '.env'), 'SECRET=abc');
  assert.ok(!exists(cwd, 'controllers'));
});

test('scaffold with force replaces project files but always keeps .env and .gitignore', (t) => {
  const cwd = makeProject(t, {
    'package.json': '{"name":"my-real-app"}',
    'app.js': 'original app',
    '.env': 'SECRET=abc',
    '.gitignore': 'custom-ignore',
  });

  scaffold({ cwd, language: 'JavaScript', useSrc: false, database: null, force: true });

  assert.match(read(cwd, 'app.js'), /express\(\)/);
  assert.notEqual(JSON.parse(read(cwd, 'package.json')).name, 'my-real-app');
  assert.equal(read(cwd, '.env'), 'SECRET=abc');
  assert.equal(read(cwd, '.gitignore'), 'custom-ignore');
});

test('tsconfig lets tsc emit so "npm start" can run the build', () => {
  for (const useSrc of [true, false]) {
    const { compilerOptions, exclude } = buildTsconfig({ useSrc });
    assert.equal(compilerOptions.noEmit, undefined);
    assert.equal(compilerOptions.allowImportingTsExtensions, undefined);
    assert.equal(compilerOptions.outDir, './dist');
    assert.ok(exclude.includes('node_modules') && exclude.includes('dist'));
  }
});

test('TypeScript app imports the db config without a .ts extension', () => {
  const tsApp = buildAppFile({ isTs: true, database: 'MongoDB' });
  assert.match(tsApp, /from '\.\/config\/db\.config';/);

  const jsApp = buildAppFile({ isTs: false, database: 'MongoDB' });
  assert.match(jsApp, /from '\.\/config\/db\.config\.js';/);
});

test('app file loads .env first, handles listen errors and avoids body-parser', () => {
  for (const isTs of [true, false]) {
    const app = buildAppFile({ isTs, database: null });
    assert.ok(app.startsWith("import 'dotenv/config';"));
    assert.match(app, /if \(error\) \{[\s\S]*process\.exit\(1\)/);
    assert.match(app, /express\.json\(\)/);
    assert.doesNotMatch(app, /body-parser/);
  }
});

test('.env only contains settings for the chosen database and a safe default port', () => {
  const cwd = '/tmp/shop-api';
  const none = buildEnv({ cwd, database: null });
  const mongo = buildEnv({ cwd, database: 'MongoDB' });
  const mysql = buildEnv({ cwd, database: 'MySQL' });

  for (const env of [none, mongo, mysql]) {
    assert.match(env, /^PORT=3000$/m);
    // Inline comments after a value are easy to misparse; keep comments on their own lines.
    assert.doesNotMatch(env, /=.*#/);
  }
  assert.doesNotMatch(none, /DB_|CONNECTION_URL/);
  assert.match(mongo, /^CONNECTION_URL=mongodb:\/\/127\.0\.0\.1:27017\/shop-api$/m);
  assert.doesNotMatch(mongo, /DB_HOST/);
  assert.match(mysql, /^DB_HOST=localhost$/m);
  assert.doesNotMatch(mysql, /CONNECTION_URL/);
});

test('db config matches the chosen database', () => {
  const mongo = buildDbConfig({ database: 'MongoDB' });
  assert.match(mongo, /mongoose\.connect/);
  assert.match(mongo, /CONNECTION_URL is not set/);

  const mysql = buildDbConfig({ database: 'MySQL' });
  assert.match(mysql, /export const pool = mysql\.createPool/);
  assert.match(mysql, /export const connectDB/);
});

test('package.json name comes from the directory and is a valid npm name', () => {
  assert.equal(projectNameFrom('/work/My Cool App'), 'my-cool-app');
  assert.equal(projectNameFrom('/work/shop_api'), 'shop_api');
  assert.equal(projectNameFrom('/work/.hidden'), 'hidden');
  assert.equal(projectNameFrom('/work/###'), 'express-app');
  assert.equal(buildPackageJson({ cwd: '/work/Shop API', isTs: false, baseDir: '' }).name, 'shop-api');
});

test('install commands pin a version for every package', () => {
  for (const combo of combinations) {
    for (const args of getInstallCommands(combo)) {
      const packages = args.filter((arg) => arg !== 'install' && !arg.startsWith('--'));
      assert.ok(packages.length > 0);
      for (const pkg of packages) {
        assert.match(pkg, /.@\^\d+$/, `${pkg} should be pinned to a major version`);
      }
    }
  }
});

test('install commands only include what the project needs', () => {
  const flat = (options) => getInstallCommands(options).flat().join(' ');

  const jsNone = flat({ language: 'JavaScript', database: null });
  assert.match(jsNone, /express@/);
  assert.doesNotMatch(jsNone, /mongoose|mysql2|typescript|nodemon|body-parser|--save-dev/);

  assert.match(flat({ language: 'JavaScript', database: 'MongoDB' }), /mongoose@/);
  assert.match(flat({ language: 'JavaScript', database: 'MySQL' }), /mysql2@/);

  const tsCommands = getInstallCommands({ language: 'TypeScript', database: null });
  assert.equal(tsCommands.length, 2);
  assert.match(tsCommands[1].join(' '), /--save-dev .*typescript@.*tsx@.*@types\/express@\^5/);
  assert.doesNotMatch(tsCommands.flat().join(' '), /ts-node|nodemon/);
});

test('buildFiles marks only .env and .gitignore as never-overwrite', () => {
  const kept = buildFiles({ cwd: '/tmp/x', language: 'TypeScript', useSrc: true, database: 'MySQL' })
    .filter((file) => file.keepExisting)
    .map((file) => file.path);
  assert.deepEqual(kept.sort(), ['.env', '.gitignore']);
});
