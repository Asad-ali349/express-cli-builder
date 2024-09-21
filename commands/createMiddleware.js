const fs = require('fs');
const path = require('path');
const middlewareTemplate = require('../templates/middlewareTemplate');

function createMiddleware(middlewareName) {
  const srcDir = path.join(process.cwd(), 'src');
  const middlewareDir = fs.existsSync(srcDir)
    ? path.join(srcDir, 'middlewares')
    : path.join(process.cwd(), 'middlewares');

  // Check if the middlewares directory exists, if not create it
  if (!fs.existsSync(middlewareDir)) {
    fs.mkdirSync(middlewareDir, { recursive: true });
    console.log(`Created middlewares directory at: ${middlewareDir}`);
  }

  const middlewareContent = middlewareTemplate(middlewareName);
  fs.writeFileSync(path.join(middlewareDir, `${middlewareName}.middleware.js`), middlewareContent);
  console.log(`Middleware ${middlewareName} created successfully in the middlewares directory!`);
}

module.exports = createMiddleware;
