const fs = require('fs');
const path = require('path');

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function readPackageJson(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Works out how the project in `cwd` is laid out so generated files match it:
 * - baseDir:    "<cwd>/src" when a src folder exists, otherwise cwd
 * - moduleType: "ts" (tsconfig.json present), "esm" ("type": "module") or "cjs"
 * - database:   "MongoDB" / "MySQL" based on installed dependencies, else null
 * - structure:  "modular" when package.json has "expressCli": { "structure": "modular" }, else "small"
 * - features:   extras chosen at init time (Large projects only)
 */
function detectProject(cwd = process.cwd()) {
  const srcDir = path.join(cwd, 'src');
  const baseDir = isDirectory(srcDir) ? srcDir : cwd;
  const isTypeScript = fs.existsSync(path.join(cwd, 'tsconfig.json'));
  const pkg = readPackageJson(cwd);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  let moduleType = 'cjs';
  if (isTypeScript) moduleType = 'ts';
  else if (pkg.type === 'module') moduleType = 'esm';

  let database = null;
  if (deps.mongoose) database = 'MongoDB';
  else if (deps.mysql2) database = 'MySQL';

  // Projects created with the Large size carry a marker in package.json.
  const marker = pkg.expressCli && typeof pkg.expressCli === 'object' ? pkg.expressCli : {};
  const structure = marker.structure === 'modular' ? 'modular' : 'small';
  const features = Array.isArray(marker.features) ? marker.features : [];

  return {
    cwd,
    baseDir,
    moduleType,
    database,
    structure,
    features,
    apiPrefix: features.includes('apiPrefix') ? '/api/v1' : '',
    ext: isTypeScript ? 'ts' : 'js',
    // Native ES modules need the file extension in relative imports.
    importExt: moduleType === 'esm' ? '.js' : '',
  };
}

/**
 * Writes all files or none: if any target already exists and `force` is not
 * set, nothing is written and an error listing the conflicts is thrown.
 * Returns the paths that were actually written.
 */
/** Throws if any file would be overwritten without force. Returns the files that will be written. */
function checkConflicts(allFiles, { force = false, cwd = process.cwd() } = {}) {
  // Files marked keepExisting (for example .env or shared helpers) are only
  // created when missing and are never overwritten, not even with force.
  const files = allFiles.filter((file) => !(file.keepExisting && fs.existsSync(file.path)));
  const conflicts = files.filter((file) => fs.existsSync(file.path));
  if (conflicts.length > 0 && !force) {
    const list = conflicts.map((file) => `  - ${path.relative(cwd, file.path) || file.path}`).join('\n');
    throw new Error(`Refusing to overwrite existing file(s):\n${list}\nRe-run with --force to overwrite.`);
  }
  return files;
}

function writeFiles(allFiles, { force = false, cwd = process.cwd() } = {}) {
  const files = checkConflicts(allFiles, { force, cwd });
  for (const file of files) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.content);
  }
  return files.map((file) => file.path);
}

module.exports = { detectProject, writeFiles, checkConflicts, readPackageJson };
