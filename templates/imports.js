/**
 * Generated files import each other. The generator works out the real
 * relative paths for the project's layout and passes them in `project.imports`;
 * templates fall back to the classic small-project paths when they are absent.
 */
function importFrom(project, key, fallback) {
  const imports = project.imports || {};
  return imports[key] || `${fallback}${project.importExt || ''}`;
}

/** One import line in the project's module syntax. */
function importLine({ moduleType }, names, from) {
  return moduleType === 'cjs' ? `const ${names} = require('${from}');` : `import ${names} from '${from}';`;
}

module.exports = { importFrom, importLine };
