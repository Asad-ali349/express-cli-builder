const fs = require('fs');
const path = require('path');
const { writeFiles } = require('../project');
const { runNpm } = require('../npm');
const small = require('./small');
const modular = require('./modular');
const { EXTRAS, FEATURE_KEYS } = require('./extras');
const { projectNameFrom, buildDbConfig, buildTsconfig, buildEnv } = require('./shared');

// Major versions are pinned so a new major release of a dependency cannot
// silently break freshly generated projects.
const DEPENDENCIES = {
  base: ['express@^5', 'cors@^2', 'dotenv@^17'],
  MongoDB: ['mongoose@^9'],
  MySQL: ['mysql2@^3'],
};
const DEV_DEPENDENCIES = {
  TypeScript: ['typescript@^5', 'tsx@^4', '@types/express@^5', '@types/cors@^2', '@types/node@^22'],
};

const DATABASES = ['MongoDB', 'MySQL'];

function normalizeOptions(options) {
  const language = options.language === 'TypeScript' ? 'TypeScript' : 'JavaScript';
  const size = options.size === 'large' ? 'large' : 'small';
  const isTs = language === 'TypeScript';
  // Large projects always use src; extras only exist for Large projects.
  const useSrc = size === 'large' ? true : Boolean(options.useSrc);
  const requested = size === 'large' && Array.isArray(options.features) ? options.features : [];
  const unknown = requested.filter((key) => !FEATURE_KEYS.includes(key));
  if (unknown.length > 0) throw new Error(`Unknown extra(s): ${unknown.join(', ')}`);

  return {
    cwd: options.cwd || process.cwd(),
    size,
    language,
    database: DATABASES.includes(options.database) ? options.database : null,
    useSrc,
    features: FEATURE_KEYS.filter((key) => requested.includes(key)),
    force: Boolean(options.force),
    isTs,
    ext: isTs ? 'ts' : 'js',
    // TypeScript resolves imports without an extension; native ESM needs ".js".
    importExt: isTs ? '' : '.js',
    baseDir: useSrc ? 'src/' : '',
  };
}

const builderFor = (options) => (options.size === 'large' ? modular : small);

/** Every file `init` would create, relative to the project root. */
function buildFiles(rawOptions) {
  const options = normalizeOptions(rawOptions);
  return builderFor(options).buildFiles(options);
}

function buildDirectories(rawOptions) {
  const options = normalizeOptions(rawOptions);
  return builderFor(options).buildDirectories(options);
}

/**
 * Creates the project skeleton in `cwd`. Refuses to overwrite an existing
 * project unless `force` is set, and never overwrites .env or .gitignore.
 */
function scaffold(rawOptions) {
  const options = normalizeOptions(rawOptions);
  const { cwd, force } = options;
  const files = builderFor(options)
    .buildFiles(options)
    .map((file) => ({ ...file, path: path.join(cwd, file.path) }));

  const written = writeFiles(files, { force, cwd });
  for (const dir of builderFor(options).buildDirectories(options)) {
    fs.mkdirSync(path.join(cwd, dir), { recursive: true });
  }
  return written;
}

function getInstallCommands(rawOptions) {
  const options = normalizeOptions(rawOptions);
  const extras = options.size === 'large' ? modular.packagesFor(options) : { dependencies: [], devDependencies: [] };
  const dependencies = [...DEPENDENCIES.base, ...(DEPENDENCIES[options.database] || []), ...extras.dependencies];
  const devDependencies = [...(DEV_DEPENDENCIES[options.language] || []), ...extras.devDependencies];

  const commands = [['install', ...dependencies]];
  if (devDependencies.length > 0) commands.push(['install', '--save-dev', ...devDependencies]);
  return commands;
}

function installDependencies(rawOptions) {
  const { cwd } = normalizeOptions(rawOptions);
  for (const args of getInstallCommands(rawOptions)) runNpm(args, cwd);
}

module.exports = {
  EXTRAS,
  FEATURE_KEYS,
  normalizeOptions,
  scaffold,
  buildFiles,
  buildDirectories,
  buildPackageJson: small.buildPackageJson,
  buildAppFile: small.buildAppFile,
  buildModularApp: modular.buildModularApp,
  buildServer: modular.buildServer,
  buildTsconfig,
  buildEnv,
  buildDbConfig,
  getInstallCommands,
  installDependencies,
  projectNameFrom,
};
