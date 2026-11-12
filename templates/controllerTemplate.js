const { toPascalCase, toCamelCase } = require('../lib/utils');
const { importFrom } = require('./imports');

const HANDLERS = ['getAll', 'getById', 'create', 'update', 'remove'];

/** Controller without a model: every handler answers 501 until it is implemented. */
function stubBodies(name) {
  const stub = (handler, todo) => [`  // TODO: ${todo}`, `  res.status(501).json({ message: '${handler} ${name}: not implemented' });`];
  return {
    getAll: stub('getAll', `return all ${name} records`),
    getById: stub('getById', `return the ${name} with id req.params.id`),
    create: stub('create', `create a new ${name} from req.body`),
    update: stub('update', `update the ${name} with id req.params.id from req.body`),
    remove: stub('remove', `delete the ${name} with id req.params.id`),
  };
}

/** Working CRUD handlers that call the generated model. */
function crudBodies(model, label, database) {
  const call =
    database === 'MySQL'
      ? {
          getAll: `${model}.findAll()`,
          getById: `${model}.findById(req.params.id)`,
          create: `${model}.create(req.body)`,
          update: `${model}.update(req.params.id, req.body)`,
          remove: `${model}.remove(req.params.id)`,
        }
      : {
          getAll: `${model}.find()`,
          getById: `${model}.findById(req.params.id)`,
          create: `${model}.create(req.body)`,
          update: `${model}.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true })`,
          remove: `${model}.findByIdAndDelete(req.params.id)`,
        };
  const notFound = (variable) => [
    `  if (!${variable}) {`,
    `    res.status(404).json({ message: '${label} not found' });`,
    '    return;',
    '  }',
  ];
  return {
    getAll: [`  const items = await ${call.getAll};`, '  res.status(200).json(items);'],
    getById: [`  const item = await ${call.getById};`, ...notFound('item'), '  res.status(200).json(item);'],
    create: ['  // req.body was checked and cleaned by the validation on this route.', `  const item = await ${call.create};`, '  res.status(201).json(item);'],
    update: ['  // req.body was checked and cleaned by the validation on this route.', `  const item = await ${call.update};`, ...notFound('item'), '  res.status(200).json(item);'],
    remove: [`  const deleted = await ${call.remove};`, ...notFound('deleted'), `  res.status(200).json({ message: '${label} deleted' });`],
  };
}

/** Thin handlers for modular projects: all logic lives in the service. */
function serviceBodies(service, label) {
  return {
    getAll: [`  const items = await ${service}.findAll();`, '  res.status(200).json(items);'],
    getById: [`  const item = await ${service}.findById(req.params.id);`, '  res.status(200).json(item);'],
    create: [`  const item = await ${service}.create(req.body);`, '  res.status(201).json(item);'],
    update: [`  const item = await ${service}.update(req.params.id, req.body);`, '  res.status(200).json(item);'],
    remove: [`  await ${service}.remove(req.params.id);`, `  res.status(200).json({ message: '${label} deleted' });`],
  };
}

module.exports = (controllerName, project) => {
  const { moduleType, database = null, withModel = false, withService = false } = project;
  const isTs = moduleType === 'ts';
  const isCjs = moduleType === 'cjs';
  // Handlers that read req.params.id declare it, so TypeScript knows it is a string.
  const WITH_ID = ['getById', 'update', 'remove'];
  const argsFor = (handler) => {
    if (!isTs) return 'req, res';
    return WITH_ID.includes(handler) ? 'req: Request<{ id: string }>, res: Response' : 'req: Request, res: Response';
  };
  const decl = isCjs ? 'const' : 'export const';

  const label = toPascalCase(controllerName);
  // Avoid clashing with the Express types imported in TypeScript controllers.
  const model = ['Request', 'Response'].includes(label) ? `${label}Model` : label;
  const modelPath = importFrom(project, 'model', `../models/${controllerName}.model`);

  const lines = [];
  if (isTs) lines.push("import { Request, Response } from 'express';");
  const service = `${toCamelCase(controllerName)}Service`;
  if (withService) {
    const servicePath = importFrom(project, 'service', `../services/${controllerName}.service`);
    lines.push(isCjs ? `const ${service} = require('${servicePath}');` : `import * as ${service} from '${servicePath}';`);
  } else if (withModel) {
    lines.push(isCjs ? `const ${model} = require('${modelPath}');` : `import ${model} from '${modelPath}';`);
  }
  if (lines.length > 0) lines.push('');

  let bodies = stubBodies(controllerName);
  if (withService) bodies = serviceBodies(service, label);
  else if (withModel) bodies = crudBodies(model, label, database);
  for (const handler of HANDLERS) {
    lines.push(`${decl} ${handler} = async (${argsFor(handler)}) => {`, ...bodies[handler], '};', '');
  }
  if (isCjs) lines.push(`module.exports = { ${HANDLERS.join(', ')} };`, '');
  return lines.join('\n').replace(/\n+$/, '\n');
};

module.exports.HANDLERS = HANDLERS;
