const fs = require('fs');
const path = require('path');
const modelTemplate = require('../templates/modelTemplate');

function createModel(modelName) {
  const srcDir = path.join(process.cwd(), 'src');
  const modelsDir = fs.existsSync(srcDir)
    ? path.join(srcDir, 'models')
    : path.join(process.cwd(), 'models');

  // Check if the models directory exists, if not create it
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
    console.log(`Created models directory at: ${modelsDir}`);
  }

  const modelContent = modelTemplate(modelName);
  fs.writeFileSync(path.join(modelsDir, `${modelName}.model.js`), modelContent);
  console.log(`Model ${modelName} created successfully in the models directory!`);
}

module.exports = createModel;
