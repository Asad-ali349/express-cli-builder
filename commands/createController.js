const fs = require('fs');
const path = require('path');
const controllerTemplate = require('../templates/controllerTemplate');

function createController(controllerName) {
  const srcDir = path.join(process.cwd(), 'src');
  const controllersDir = fs.existsSync(srcDir)
    ? path.join(srcDir, 'controllers')
    : path.join(process.cwd(), 'controllers');

  // Check if the controllers directory exists, if not create it
  if (!fs.existsSync(controllersDir)) {
    fs.mkdirSync(controllersDir, { recursive: true });
    console.log(`Created controllers directory at: ${controllersDir}`);
  }

  const isTypeScript = fs.existsSync(path.join(process.cwd(), 'tsconfig.json'));
  const fileExtension = isTypeScript ? 'ts' : 'js';

  const controllerContent = controllerTemplate(controllerName,fileExtension);
  fs.writeFileSync(path.join(controllersDir, `${controllerName}.controller.${fileExtension}`), controllerContent);
  console.log(`Controller ${controllerName} created successfully in the controllers directory!`);
}

module.exports = createController;
