const fs = require('fs');
const path = require('path');
const { validateName } = require('./utils');

/** Folder and file suffix for each kind of generated file. */
const KINDS = {
  model: { folder: 'models', suffix: 'model' },
  route: { folder: 'routes', suffix: 'routes' },
  controller: { folder: 'controllers', suffix: 'controller' },
  middleware: { folder: 'middlewares', suffix: 'middleware' },
  validation: { folder: 'validations', suffix: 'validation' },
  service: { folder: 'services', suffix: 'service' },
  docs: { folder: 'docs', suffix: 'docs' },
  test: { folder: 'tests', suffix: 'test' },
};

/** Shared files every layout knows about, relative to the base folder, without extension. */
const SHARED = {
  small: {
    validateMiddleware: 'middlewares/validate.middleware',
    errors: 'utils/errors',
    errorMiddleware: 'middlewares/error.middleware',
    dbConfig: 'config/db.config',
  },
  modular: {
    validateMiddleware: 'common/middlewares/validate.middleware',
    errors: 'common/errors/app-error',
    errorMiddleware: 'common/middlewares/error.middleware',
    dbConfig: 'config/db.config',
    env: 'config/env',
    logger: 'common/utils/logger',
    app: 'app',
    routesRegistry: 'routes',
    docsRegistry: 'docs',
  },
};

const isModular = (project) => project.structure === 'modular';

function sharedFile(project, key) {
  const relative = SHARED[isModular(project) ? 'modular' : 'small'][key];
  return relative ? path.join(project.baseDir, `${relative}.${project.ext}`) : null;
}

/**
 * Where a generated file goes.
 * - Small projects: <base>/<folder>/<name>.<suffix>.<ext>
 * - Modular, inside a module: src/modules/<module>/<folder>/<name>.<suffix>.<ext>
 *   (route files sit at the module root)
 * - Modular, no module: src/common/<folder>/<name>.<suffix>.<ext>
 */
function targetFile(project, kind, name, moduleName = null) {
  const { folder, suffix } = KINDS[kind];
  const file = `${name}.${suffix}.${project.ext}`;
  if (!isModular(project)) return path.join(project.baseDir, folder, file);
  if (moduleName) {
    const moduleDir = path.join(project.baseDir, 'modules', moduleName);
    return kind === 'route' ? path.join(moduleDir, file) : path.join(moduleDir, folder, file);
  }
  return path.join(project.baseDir, 'common', folder, file);
}

/** Checks a --module option against the project; returns the module name or null. */
function resolveModule(project, moduleName) {
  if (moduleName === undefined || moduleName === null) return null;
  if (!isModular(project)) {
    throw new Error('--module only works in modular projects (created with "express init" and the Large size).');
  }
  validateName(moduleName, 'module name');
  const moduleDir = path.join(project.baseDir, 'modules', moduleName);
  if (!fs.existsSync(moduleDir)) {
    throw new Error(`Module "${moduleName}" does not exist. Create it first with: express create:resource ${moduleName}`);
  }
  return moduleName;
}

/** Relative import specifier from one generated file to another, e.g. "../models/user.model.js". */
function importSpecifier(fromFile, toFile, { importExt }) {
  const withoutExt = toFile.replace(/\.(ts|js)$/, '');
  let relative = path.relative(path.dirname(fromFile), withoutExt).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return `${relative}${importExt}`;
}

module.exports = { KINDS, SHARED, isModular, sharedFile, targetFile, resolveModule, importSpecifier };
