const { generate } = require('../lib/generators');
const { detectProject } = require('../lib/project');
const { isModular } = require('../lib/layout');
const { validateName } = require('../lib/utils');
const { decide } = require('../lib/prompt');
const { ensureDatabase } = require('../lib/database');

async function createResource(resourceName, options = {}) {
  validateName(resourceName, 'resource name');
  const project = detectProject(options.cwd || process.cwd());

  const kinds = ['model', 'validation', 'route', 'controller'];
  if (isModular(project)) {
    kinds.push('service');
    if (project.features.includes('swagger') && (await decide(options, 'docs', `Add Swagger docs for the ${resourceName} module?`))) {
      kinds.push('docs');
    }
    if (project.features.includes('testing') && (await decide(options, 'tests', `Add tests for the ${resourceName} module?`))) {
      kinds.push('test');
    }
  }

  // Fail on conflicts before asking anything or setting up a database.
  generate(kinds, resourceName, { ...options, resource: true, check: true });
  const setup = await ensureDatabase(options.cwd || process.cwd(), options);
  const files = generate(kinds, resourceName, { ...options, resource: true, database: setup.database });
  setup.install();
  const parts = isModular(project) ? 'model, validation, route, controller, and service' : 'model, validation, route, and controller';
  console.log(`Resource ${resourceName} created successfully with ${parts}!`);
  return files;
}

module.exports = createResource;
