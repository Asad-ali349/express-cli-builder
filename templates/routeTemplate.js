const { schemaNames } = require('./validationTemplate');
const { importFrom } = require('./imports');

module.exports = (routeName, project) => {
  const { moduleType, withValidation = false } = project;
  const isCjs = moduleType === 'cjs';
  const handlers = 'getAll, getById, create, update, remove';
  const imports = [
    { names: '{ Router }', from: 'express' },
    { names: `{ ${handlers} }`, from: importFrom(project, 'controller', `../controllers/${routeName}.controller`) },
  ];

  let createHandler = 'create';
  let updateHandler = 'update';
  if (withValidation) {
    const schemas = schemaNames(routeName);
    imports.push(
      { names: '{ validate }', from: importFrom(project, 'validateMiddleware', '../middlewares/validate.middleware') },
      { names: `{ ${schemas.create}, ${schemas.update} }`, from: importFrom(project, 'validation', `../validations/${routeName}.validation`) }
    );
    createHandler = `validate(${schemas.create}), create`;
    updateHandler = `validate(${schemas.update}), update`;
  }

  const importLines = imports.map(({ names, from }) =>
    isCjs ? `const ${names} = require('${from}');` : `import ${names} from '${from}';`
  );
  const routes = [
    "router.get('/', getAll);",
    "router.get('/:id', getById);",
    `router.post('/', ${createHandler});`,
    `router.put('/:id', ${updateHandler});`,
    "router.delete('/:id', remove);",
  ];

  // No controller yet: keep everything that needs it commented, so the app
  // still builds and the (empty) router can already be mounted.
  if (project.withController === false) {
    importLines[1] = `// ${importLines[1]}`;
    return `${importLines.join('\n')}

// The controller for this route does not exist yet. Create it with
//   express create:controller ${routeName}
// then uncomment the import above and the routes below.

const router = Router();

${routes.map((line) => `// ${line}`).join('\n')}

${isCjs ? 'module.exports = router;' : 'export default router;'}
`;
  }

  return `${importLines.join('\n')}

const router = Router();

// Define your routes here
${routes.join('\n')}

${isCjs ? 'module.exports = router;' : 'export default router;'}
`;
};
