const fs = require('fs');
const path = require('path');
const { toCamelCase } = require('./utils');
const { sharedFile, importSpecifier } = require('./layout');

const IMPORT_LINE = /^(import\s.+|(const|let|var)\s.+=\s*require\(.+\);?)\s*$/;
const MOUNTED_ROUTE_LINE = /^app\.use\(\s*['"]\/[^'"]*['"]\s*,\s*\w+Routes\s*\);?\s*$/;

/** The two lines that register a route file in the app. */
function mountSnippet(name, { moduleType, importExt }) {
  const variable = `${toCamelCase(name)}Routes`;
  const importPath = `./routes/${name}.routes${importExt}`;
  return {
    importPath,
    importLine:
      moduleType === 'cjs'
        ? `const ${variable} = require('${importPath}');`
        : `import ${variable} from '${importPath}';`,
    useLine: `app.use('/${name}', ${variable});`,
  };
}

/**
 * Returns `source` with the route imported and mounted, or null when the file
 * does not look like an app file we can edit safely (the caller then falls
 * back to printing instructions). Returns the source unchanged if the route
 * is already mounted.
 */
function addRouteToSource(source, name, project) {
  const { importPath, importLine, useLine } = mountSnippet(name, project);
  if (source.includes(`'${importPath}'`) || source.includes(`"${importPath}"`)) return source;

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);

  let lastImport = -1;
  lines.forEach((line, index) => {
    if (IMPORT_LINE.test(line)) lastImport = index;
  });

  // Routes go before the 404 handler when there is one, otherwise just before
  // the server setup so they come after the global middleware; failing both,
  // after the last top-level app.use(...).
  let anchor = lines.findIndex((line) => /^app\.use\(notFound\)/.test(line));
  if (anchor === -1) anchor = lines.findIndex((line) => /^(const|let|var)\s+PORT\b/.test(line));
  if (anchor === -1) anchor = lines.findIndex((line) => /^app\.listen\(/.test(line));
  if (anchor === -1) {
    let lastUse = -1;
    lines.forEach((line, index) => {
      if (/^app\.use\(.*\);?\s*$/.test(line)) lastUse = index;
    });
    if (lastUse !== -1) anchor = lastUse + 1;
  }

  // Keep a comment that introduces the anchor attached to it.
  while (anchor > 0 && /^\s*\/\//.test(lines[anchor - 1])) anchor--;

  const definesApp = lines.some((line) => /^(const|let|var)\s+app\s*=/.test(line));
  if (lastImport === -1 || anchor === -1 || anchor <= lastImport || !definesApp) return null;

  // Insert after the last non-blank line before the anchor, grouping
  // consecutive routes together and keeping one blank line around the group.
  let previous = anchor - 1;
  while (previous > lastImport && lines[previous].trim() === '') previous--;
  const insertion = MOUNTED_ROUTE_LINE.test(lines[previous]) ? [useLine] : ['', useLine];
  if ((lines[previous + 1] || '').trim() !== '') insertion.push('');

  lines.splice(previous + 1, 0, ...insertion);
  lines.splice(lastImport + 1, 0, importLine);
  return lines.join(newline);
}

/**
 * Registers the route in the project's app file.
 * Returns { status: 'mounted' | 'already' | 'manual', file?, snippet }.
 */
function mountRoute(name, project) {
  const snippet = mountSnippet(name, project);
  const file = ['app', 'index', 'server']
    .map((base) => path.join(project.baseDir, `${base}.${project.ext}`))
    .find((candidate) => fs.existsSync(candidate));
  if (!file) return { status: 'manual', snippet };

  const source = fs.readFileSync(file, 'utf8');
  const updated = addRouteToSource(source, name, project);
  if (updated === null) return { status: 'manual', snippet };
  if (updated === source) return { status: 'already', file, snippet };

  fs.writeFileSync(file, updated);
  return { status: 'mounted', file, snippet };
}

// Registries generated for modular projects end with a marker comment; new
// entries are inserted on the line above it.
const REGISTRY_MARKER = /are added above this line by "express create:resource"/;

/**
 * Adds an import and an entry to a registry file (src/routes, src/docs).
 * Returns the updated source, the same source if the import is already there,
 * or null when the marker comment is missing.
 */
function addToRegistry(source, { importLine, entryLine, importPath }) {
  if (source.includes(`'${importPath}'`) || source.includes(`"${importPath}"`)) return source;

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const marker = lines.findIndex((line) => REGISTRY_MARKER.test(line));
  if (marker === -1) return null;

  const indent = lines[marker].match(/^\s*/)[0];
  lines.splice(marker, 0, `${indent}${entryLine}`);

  let lastImport = -1;
  lines.forEach((line, index) => {
    if (IMPORT_LINE.test(line)) lastImport = index;
  });
  // The first import of a file gets a blank line after it.
  lines.splice(lastImport + 1, 0, ...(lastImport === -1 ? [importLine, ''] : [importLine]));
  return lines.join(newline);
}

function updateRegistry(registryFile, snippet) {
  if (!registryFile || !fs.existsSync(registryFile)) return { status: 'manual', snippet };
  const source = fs.readFileSync(registryFile, 'utf8');
  const updated = addToRegistry(source, snippet);
  if (updated === null) return { status: 'manual', snippet };
  if (updated === source) return { status: 'already', file: registryFile, snippet };
  fs.writeFileSync(registryFile, updated);
  return { status: 'mounted', file: registryFile, snippet };
}

const importStatement = ({ moduleType }, names, from) =>
  moduleType === 'cjs' ? `const ${names} = require('${from}');` : `import ${names} from '${from}';`;

/** The two lines that register a module route in src/routes. */
function moduleRouteSnippet(name, routeFile, project) {
  const registry = sharedFile(project, 'routesRegistry');
  const variable = `${toCamelCase(name)}Routes`;
  const importPath = importSpecifier(registry, routeFile, project);
  return {
    importPath,
    importLine: importStatement(project, variable, importPath),
    entryLine: `router.use('/${name}', ${variable});`,
  };
}

/** Modular projects: mounts a route file in src/routes. */
function mountModuleRoute(name, routeFile, project) {
  return updateRegistry(sharedFile(project, 'routesRegistry'), moduleRouteSnippet(name, routeFile, project));
}

/** Modular projects: registers a module's OpenAPI paths in src/docs. */
function registerDocs(name, docsFile, project) {
  const registry = sharedFile(project, 'docsRegistry');
  const variable = `${toCamelCase(name)}Docs`;
  const importPath = importSpecifier(registry, docsFile, project);
  const snippet = {
    importPath,
    importLine: importStatement(project, `{ ${variable} }`, importPath),
    entryLine: `${variable},`,
  };
  return updateRegistry(registry, snippet);
}

module.exports = { mountRoute, addRouteToSource, mountSnippet, addToRegistry, mountModuleRoute, moduleRouteSnippet, registerDocs };
