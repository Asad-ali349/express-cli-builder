const { projectNameFrom } = require('../shared');

/** OpenAPI registry; create:resource adds each module's paths to moduleDocs. */
function docsFile({ cwd, isTs, features }) {
  const server = features.includes('apiPrefix') ? '/api/v1' : '/';
  const type = isTs ? ': Record<string, unknown>[]' : '';
  return `const moduleDocs${type} = [
  // Module docs are added above this line by "express create:resource".
];

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: '${projectNameFrom(cwd)}', version: '1.0.0' },
  servers: [{ url: '${server}' }],
  paths: Object.assign({}, ...moduleDocs),
};
`;
}

module.exports = {
  key: 'swagger',
  label: 'Swagger API docs (/api-docs)',
  dependencies: () => ['swagger-ui-express@^5'],
  devDependencies: (o) => (o.isTs ? ['@types/swagger-ui-express@^4'] : []),
  files: (o) => [{ path: `src/docs.${o.ext}`, content: docsFile(o) }],
};
