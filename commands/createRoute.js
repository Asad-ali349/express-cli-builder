const fs = require('fs');
const path = require('path');
const routeTemplate = require('../templates/routeTemplate');

function createRoute(routeName) {
  const srcDir = path.join(process.cwd(), 'src');
  const routesDir = fs.existsSync(srcDir)
    ? path.join(srcDir, 'routes')
    : path.join(process.cwd(), 'routes');

  // Check if the routes directory exists, if not create it
  if (!fs.existsSync(routesDir)) {
    fs.mkdirSync(routesDir, { recursive: true });
    console.log(`Created routes directory at: ${routesDir}`);
  }

  const routeContent = routeTemplate(routeName);
  fs.writeFileSync(path.join(routesDir, `${routeName}.routes.js`), routeContent);
  console.log(`Route ${routeName} created successfully in the routes directory!`);
}

module.exports = createRoute;
