const fs = require('fs');
const path = require('path');
const { readPackageJson } = require('./project');
const { runNpm } = require('./npm');

/**
 * Makes sure `name` is a dependency of the project in `cwd`, installing
 * `name@range` only when it is missing. Returns what happened:
 * 'present' | 'installed' | 'skipped' | 'no-package-json'.
 */
function ensurePackage(cwd, name, range, { run = runNpm, skip = false } = {}) {
  const spec = `${name}@${range}`;
  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    console.log(`No package.json found. Install ${name} in your project with: npm install ${spec}`);
    return 'no-package-json';
  }

  const pkg = readPackageJson(cwd);
  if ((pkg.dependencies && pkg.dependencies[name]) || (pkg.devDependencies && pkg.devDependencies[name])) {
    return 'present';
  }
  if (skip) {
    console.log(`Skipped installing ${name}. Install it with: npm install ${spec}`);
    return 'skipped';
  }

  console.log(`Installing ${spec}...`);
  try {
    run(['install', spec], cwd);
  } catch (error) {
    throw new Error(`The files were created, but installing ${name} failed (${error.message}). Install it with: npm install ${spec}`);
  }
  return 'installed';
}

module.exports = { ensurePackage };
