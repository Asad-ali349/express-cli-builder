const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { makeProject, read, exists } = require('./helpers');
const pkg = require('../package.json');

const CLI = path.join(__dirname, '..', 'bin', 'express-cli.js');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('--version prints the package version', (t) => {
  const result = run(makeProject(t), '--version');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});

test('--help lists every command', (t) => {
  const result = run(makeProject(t), '--help');
  assert.equal(result.status, 0);
  for (const command of ['create:model', 'create:route', 'create:controller', 'create:middleware', 'create:resource', 'create:validation', 'create:service', 'init']) {
    assert.ok(result.stdout.includes(command), `help should list ${command}`);
  }
});

test('unknown commands fail with a non-zero exit code', (t) => {
  const result = run(makeProject(t), 'nope');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown command/);
});

test('create:resource works end to end and exits 0', (t) => {
  const cwd = makeProject(t, { 'package.json': { type: 'module', dependencies: { mongoose: '^9.0.0' } } });
  const result = run(cwd, 'create:resource', 'product', '--skip-install');

  assert.equal(result.status, 0, result.stderr);
  assert.ok(exists(cwd, 'models/product.model.js'));
  assert.ok(exists(cwd, 'routes/product.routes.js'));
  assert.ok(exists(cwd, 'controllers/product.controller.js'));
});

test('an invalid name exits 1 with a clear message and writes nothing', (t) => {
  const root = makeProject(t, { 'project/.keep': '' });
  const cwd = path.join(root, 'project');
  const result = run(cwd, 'create:controller', '../../escaped');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Error: Invalid controller name/);
  assert.doesNotMatch(result.stderr, /\n\s+at /, 'should not print a stack trace');
  assert.deepEqual(fs.readdirSync(root), ['project']);
});

test('overwriting exits 1 unless --force is passed', (t) => {
  const cwd = makeProject(t, { 'models/user.model.js': 'KEEP ME' });

  const refused = run(cwd, 'create:model', 'user', '--database', 'MongoDB', '--skip-install');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Refusing to overwrite/);
  assert.equal(read(cwd, 'models/user.model.js'), 'KEEP ME');

  const forced = run(cwd, 'create:model', 'user', '--force', '--database', 'MongoDB', '--skip-install');
  assert.equal(forced.status, 0, forced.stderr);
  assert.notEqual(read(cwd, 'models/user.model.js'), 'KEEP ME');
});

test('init refuses to run in an existing project before asking any question', (t) => {
  const cwd = makeProject(t, { 'package.json': '{"name":"my-real-app"}', '.env': 'SECRET=abc' });
  const result = run(cwd, 'init');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /already contains a package\.json/);
  assert.equal(result.stdout, '');
  assert.equal(read(cwd, 'package.json'), '{"name":"my-real-app"}');
  assert.equal(read(cwd, '.env'), 'SECRET=abc');
});
