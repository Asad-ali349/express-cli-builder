const { toPascalCase } = require('../lib/utils');
const { importFrom, importLine } = require('./imports');

const OPERATIONS = ['findAll', 'findById', 'create', 'update', 'remove'];

/**
 * Business logic for a module. Controllers stay thin and call these functions;
 * services talk to the model and throw NotFoundError, which the error
 * middleware turns into a 404.
 */
module.exports = (serviceName, project) => {
  const { moduleType, database = null, withModel = false } = project;
  const isTs = moduleType === 'ts';
  const isCjs = moduleType === 'cjs';
  const decl = isCjs ? 'const' : 'export const';
  const label = toPascalCase(serviceName);
  const model = `${label}Model`;
  // Stub handlers do not use their arguments yet; the _ prefix keeps linters quiet.
  const unused = withModel ? '' : '_';
  const id = `${unused}id${isTs ? ': string' : ''}`;
  const data = `${unused}data${isTs ? ': Record<string, unknown>' : ''}`;

  const errorNames = withModel ? '{ NotFoundError }' : '{ AppError }';
  const lines = [importLine(project, errorNames, importFrom(project, 'errors', '../errors/app-error'))];
  if (withModel) lines.push(importLine(project, model, importFrom(project, 'model', `../models/${serviceName}.model`)));
  lines.push('');

  const signatures = {
    findAll: '()',
    findById: `(${id})`,
    create: `(${data})`,
    update: `(${id}, ${data})`,
    remove: `(${id})`,
  };

  let bodies;
  if (!withModel) {
    const stub = (op) => [`  // TODO: implement ${op} for ${serviceName}`, `  throw new AppError(501, '${op} ${serviceName}: not implemented');`];
    bodies = Object.fromEntries(OPERATIONS.map((op) => [op, stub(op)]));
  } else {
    const notFound = `throw new NotFoundError('${label} not found')`;
    const mysql = database === 'MySQL';
    bodies = {
      findAll: [`  return ${model}.${mysql ? 'findAll' : 'find'}();`],
      findById: [`  const item = await ${model}.findById(id);`, `  if (!item) ${notFound};`, '  return item;'],
      create: [`  return ${model}.create(data);`],
      update: mysql
        ? [`  const item = await ${model}.update(id, data);`, `  if (!item) ${notFound};`, '  return item;']
        : [
            `  const item = await ${model}.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });`,
            `  if (!item) ${notFound};`,
            '  return item;',
          ],
      remove: mysql
        ? [`  const deleted = await ${model}.remove(id);`, `  if (!deleted) ${notFound};`]
        : [`  const deleted = await ${model}.findByIdAndDelete(id);`, `  if (!deleted) ${notFound};`],
    };
  }

  for (const op of OPERATIONS) {
    lines.push(`${decl} ${op} = async ${signatures[op]} => {`, ...bodies[op], '};', '');
  }
  if (isCjs) lines.push(`module.exports = { ${OPERATIONS.join(', ')} };`, '');
  return lines.join('\n').replace(/\n+$/, '\n');
};

module.exports.OPERATIONS = OPERATIONS;
