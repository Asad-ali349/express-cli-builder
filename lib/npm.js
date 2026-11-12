const { spawnSync } = require('child_process');

/** Runs `npm <args>` in `cwd`, streaming its output. Throws if npm fails. */
function runNpm(args, cwd) {
  const result = spawnSync('npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`"npm ${args.join(' ')}" failed with exit code ${result.status}. Fix the problem and run it again.`);
  }
}

module.exports = { runNpm };
