const fs = require('fs');
const path = require('path');
const { validateName } = require('./utils');
const { mountRoute, mountSnippet, mountModuleRoute, moduleRouteSnippet, registerDocs } = require('./mount');
const { detectProject, writeFiles, checkConflicts } = require('./project');
const { isModular, sharedFile, targetFile, resolveModule, importSpecifier } = require('./layout');
const { ensurePackage } = require('./install');
const validationTemplate = require('../templates/validationTemplate');
const validateMiddlewareTemplate = require('../templates/validateMiddlewareTemplate');

const ZOD = { name: 'zod', range: '^4' };

const TEMPLATES = {
  model: require('../templates/modelTemplate'),
  route: require('../templates/routeTemplate'),
  controller: require('../templates/controllerTemplate'),
  middleware: require('../templates/middlewareTemplate'),
  validation: validationTemplate,
  service: require('../templates/serviceTemplate'),
  docs: require('../templates/docsTemplate'),
  test: require('../templates/moduleTestTemplate'),
};

const MODULAR_ONLY = { service: 'Services', docs: 'Module docs', test: 'Module tests' };

/** Paths of every file a template might import, so imports can be made relative. */
function relatedFiles(project, name, moduleName, planned) {
  const related = {};
  for (const kind of ['model', 'controller', 'service', 'validation']) {
    related[kind] = planned[kind] || targetFile(project, kind, name, moduleName);
  }
  for (const key of ['validateMiddleware', 'errors', 'dbConfig', 'app', 'logger']) {
    const file = sharedFile(project, key);
    if (file) related[key] = file;
  }
  return related;
}

/**
 * Generates one or more kinds of file for `name`. All targets are checked
 * before anything is written, so a resource is created completely or not at all.
 *
 * options: cwd, force, module, resource (true for create:resource), mount,
 *          install, runNpm, database (override), withController, check (dry run)
 */
function generate(kinds, name, options = {}) {
  const cwd = options.cwd || process.cwd();
  validateName(name, `${options.resource ? 'resource' : kinds[0]} name`);

  const project = detectProject(cwd);
  // A database chosen just now (create:model in a project without one) wins.
  if (!project.database && options.database) project.database = options.database;
  const modular = isModular(project);
  for (const kind of kinds) {
    if (MODULAR_ONLY[kind] && !modular) {
      throw new Error(`${MODULAR_ONLY[kind]} are only used in modular projects (created with "express init" and the Large size).`);
    }
  }
  // A resource in a modular project is its own module; other commands use --module.
  const moduleName = options.resource && modular ? name : resolveModule(project, options.module);

  const planned = {};
  for (const kind of kinds) planned[kind] = targetFile(project, kind, name, moduleName);
  const related = relatedFiles(project, name, moduleName, planned);

  const has = (kind) => kinds.includes(kind);
  const flags = {
    // Small resource: the controller talks to the model directly.
    withModel: has('model') && has('controller') && !has('service'),
    // Modular resource: controller -> service -> model.
    withService: has('service') && has('controller'),
    // A route generated together with its validation applies it to POST and PUT.
    withValidation: has('validation') && has('route'),
    useLogger: project.features.includes('logger'),
    // create:route without a controller writes the controller parts as comments.
    withController: options.withController !== false,
  };
  // A service is linked to a model that is generated with it or already exists.
  const serviceWithModel = has('model') || fs.existsSync(related.model);

  const files = kinds.map((kind) => {
    const file = planned[kind];
    const imports = {};
    for (const [key, target] of Object.entries(related)) imports[key] = importSpecifier(file, target, project);
    const context = { ...project, ...flags, imports };
    if (kind === 'service') context.withModel = serviceWithModel;
    return { kind, path: file, content: TEMPLATES[kind](name, context) };
  });
  if (has('validation')) {
    const file = sharedFile(project, 'validateMiddleware');
    files.push({ kind: 'shared middleware', path: file, content: validateMiddlewareTemplate(project), keepExisting: true });
  }

  // check: validate everything and report conflicts, but write nothing.
  if (options.check) {
    checkConflicts(files, { force: Boolean(options.force), cwd });
    return files.map((file) => file.path);
  }
  const written = new Set(writeFiles(files, { force: Boolean(options.force), cwd }));
  for (const file of files.filter((candidate) => written.has(candidate.path))) {
    console.log(`Created ${file.kind}: ${path.relative(cwd, file.path)}`);
  }

  if (has('model') && project.database === null) {
    console.log('Note: no database driver found in package.json, so a Mongoose model was generated. Run "npm install mongoose" to use it.');
  }
  if (has('route')) reportMount(name, planned.route, project, cwd, options);
  if (has('docs')) {
    const result = registerDocs(name, planned.docs, project);
    if (result.status === 'mounted') console.log(`Registered API docs in ${path.relative(cwd, result.file)}`);
    else if (result.status === 'manual') {
      console.log(`Register the docs in src/docs:\n  ${result.snippet.importLine}\n  ${result.snippet.entryLine}`);
    }
  }
  if (has('validation')) reportValidation(name, planned.validation, cwd, flags.withValidation);

  // Install last, so a failed install never loses the generated files.
  if (has('validation')) {
    ensurePackage(cwd, ZOD.name, ZOD.range, { run: options.runNpm, skip: options.install === false });
  }
  return [...written];
}

function reportMount(name, routeFile, project, cwd, options) {
  const modular = isModular(project);
  let result;
  if (options.mount === false) {
    result = { status: 'manual', snippet: modular ? moduleRouteSnippet(name, routeFile, project) : mountSnippet(name, project) };
  } else {
    result = modular ? mountModuleRoute(name, routeFile, project) : mountRoute(name, project);
  }

  const url = `${modular ? project.apiPrefix : ''}/${name}`;
  if (result.status === 'mounted') {
    console.log(`Mounted route at ${url} in ${path.relative(cwd, result.file)}`);
  } else if (result.status === 'already') {
    console.log(`Route is already mounted in ${path.relative(cwd, result.file)}`);
  } else if (modular) {
    console.log(`Mount the route in src/routes:\n  ${result.snippet.importLine}\n  ${result.snippet.entryLine}`);
  } else {
    console.log(`Mount the route in your app file:\n  ${result.snippet.importLine}\n  ${result.snippet.useLine}`);
  }
}

function reportValidation(name, validationFile, cwd, wiredIntoRoute) {
  const { create, update } = validationTemplate.schemaNames(name);
  console.warn(
    `Warning: ${create} is empty. POST and PUT answer 501 until you add fields in ${path.relative(cwd, validationFile)}.`
  );
  if (!wiredIntoRoute) {
    console.log(
      `Apply it in your route file:\n  router.post('/', validate(${create}), create);\n  router.put('/:id', validate(${update}), update);`
    );
  }
}

module.exports = { generate, TEMPLATES };
