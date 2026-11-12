const { toPascalCase } = require('../lib/utils');

/** Exported names for a validation file, e.g. "user-profile" -> createUserProfileSchema. */
function schemaNames(name) {
  const pascal = toPascalCase(name);
  return {
    create: `create${pascal}Schema`,
    update: `update${pascal}Schema`,
    createType: `Create${pascal}Input`,
    updateType: `Update${pascal}Input`,
  };
}

module.exports = (validationName, { moduleType }) => {
  const names = schemaNames(validationName);
  const isCjs = moduleType === 'cjs';
  const decl = isCjs ? 'const' : 'export const';

  const lines = [
    isCjs ? "const { z } = require('zod');" : "import { z } from 'zod';",
    '',
    `// Add the fields a client may send when creating a ${validationName}.`,
    '// Fields that are not listed here are removed from req.body. While this schema',
    '// is empty, POST and PUT answer 501 so that empty records are never saved.',
    `${decl} ${names.create} = z.object({`,
    '  // name: z.string().min(1),',
    '  // email: z.email(),',
    '});',
    '',
    '// Same fields, all optional, for partial updates.',
    `${decl} ${names.update} = ${names.create}.partial();`,
  ];
  if (moduleType === 'ts') {
    lines.push(
      '',
      `export type ${names.createType} = z.infer<typeof ${names.create}>;`,
      `export type ${names.updateType} = z.infer<typeof ${names.update}>;`
    );
  }
  if (isCjs) lines.push('', `module.exports = { ${names.create}, ${names.update} };`);
  return lines.join('\n') + '\n';
};

module.exports.schemaNames = schemaNames;
