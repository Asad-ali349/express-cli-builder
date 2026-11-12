const { toCamelCase, toPascalCase } = require('../lib/utils');

/** OpenAPI paths for one module. Registered in src/docs by create:resource. */
module.exports = (name, { moduleType }) => {
  const label = toPascalCase(name);
  const variable = `${toCamelCase(name)}Docs`;
  const tag = `['${label}']`;
  const idParam = "[{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]";
  const body = `{
        required: true,
        // TODO: describe the fields from validations/${name}.validation
        content: { 'application/json': { schema: { type: 'object' } } },
      }`;

  const paths = `{
  '/${name}': {
    get: {
      tags: ${tag},
      summary: 'List all ${label} records',
      responses: { 200: { description: 'OK' } },
    },
    post: {
      tags: ${tag},
      summary: 'Create a ${label}',
      requestBody: ${body},
      responses: { 201: { description: 'Created' }, 400: { description: 'Validation failed' } },
    },
  },
  '/${name}/{id}': {
    get: {
      tags: ${tag},
      summary: 'Get a ${label} by id',
      parameters: ${idParam},
      responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
    },
    put: {
      tags: ${tag},
      summary: 'Update a ${label}',
      parameters: ${idParam},
      requestBody: ${body},
      responses: { 200: { description: 'OK' }, 400: { description: 'Validation failed' }, 404: { description: 'Not found' } },
    },
    delete: {
      tags: ${tag},
      summary: 'Delete a ${label}',
      parameters: ${idParam},
      responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } },
    },
  },
}`;

  if (moduleType === 'cjs') return `const ${variable} = ${paths};\n\nmodule.exports = { ${variable} };\n`;
  return `export const ${variable} = ${paths};\n`;
};
