const fs = require('fs');
const { generate } = require('../lib/generators');
const { detectProject } = require('../lib/project');
const { targetFile, resolveModule } = require('../lib/layout');
const { validateName } = require('../lib/utils');
const { decide } = require('../lib/prompt');

/**
 * A route imports the controller with the same name. When that controller
 * does not exist yet, ask whether to create it too; otherwise the route is
 * written with the controller parts commented out so the app keeps building.
 */
async function createRoute(routeName, options = {}) {
  validateName(routeName, 'route name');
  const project = detectProject(options.cwd || process.cwd());
  const moduleName = resolveModule(project, options.module);
  const controllerFile = targetFile(project, 'controller', routeName, moduleName);

  if (fs.existsSync(controllerFile)) return generate(['route'], routeName, options);

  const withController = await decide(options, 'controller', `The ${routeName} controller does not exist yet. Create it too?`, {
    flag: '--controller',
  });
  if (withController) return generate(['route', 'controller'], routeName, options);

  const files = generate(['route'], routeName, { ...options, withController: false });
  console.log(
    `The route's handlers are commented out until the controller exists. Run "express create:controller ${routeName}${
      moduleName ? ` --module ${moduleName}` : ''
    }", then uncomment them.`
  );
  return files;
}

module.exports = createRoute;
