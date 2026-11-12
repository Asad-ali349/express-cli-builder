const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

/** Creates a throwaway project directory; `files` maps relative paths to contents. */
function makeProject(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-cli-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

/** Runs `fn` with console.log silenced and returns everything it logged. */
function captureLogs(t) {
  const lines = [];
  t.mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
  return lines;
}

/** Throws if `code` is not valid CommonJS syntax. */
function assertValidCjs(code) {
  new vm.Script(code);
}

/** Throws if `code` is not valid ES module syntax. */
function assertValidEsm(code) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Invalid ES module syntax:\n${result.stderr}`);
}

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(...parts));

module.exports = { makeProject, captureLogs, assertValidCjs, assertValidEsm, read, exists };
