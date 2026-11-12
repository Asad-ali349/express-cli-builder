const { generate } = require('../lib/generators');
const { ensureDatabase } = require('../lib/database');

/** Creates a model; in a project without a database it first asks which one to set up. */
async function createModel(modelName, options = {}) {
  // Fail on bad names, unknown modules or existing files before touching anything.
  generate(['model'], modelName, { ...options, check: true });
  const setup = await ensureDatabase(options.cwd || process.cwd(), options);
  const files = generate(['model'], modelName, { ...options, database: setup.database });
  setup.install();
  return files;
}

module.exports = createModel;
