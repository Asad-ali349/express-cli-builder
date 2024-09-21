#!/usr/bin/env node

const { Command } = require('commander');
const Enquirer = require('enquirer');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const createModel = require('../commands/createModel');
const createRoute = require('../commands/createRoute');
const createController = require('../commands/createController');
const createMiddleware = require('../commands/createMiddleware');
const createResource = require('../commands/createResource');
const program = new Command();
const enquirer = new Enquirer();

program
  .command('create:model <modelName>')
  .description('Create a new model')
  .action(createModel);

program
  .command('create:route <routeName>')
  .description('Create a new route')
  .action(createRoute);

program
  .command('create:controller <controllerName>')
  .description('Create a new controller')
  .action(createController);

program
  .command('create:middleware <middlewareName>')
  .description('Create a new middleware')
  .action(createMiddleware);

program
  .command('create:resource <resourceName>')
  .description('Create a new resource with model, route, and controller')
  .action(createResource);

program
  .command('init')
  .description('Initialize a new Express project')
  .action(async () => {
    try {
      const answers = await enquirer.prompt([
        {
          type: 'select',
          name: 'language',
          message: 'Would you like to use TypeScript or JavaScript?',
          choices: ['TypeScript', 'JavaScript'],
        },
        {
          type: 'select',
          name: 'database',
          message: 'Which database would you like to use?',
          choices: ['MongoDB', 'MySQL'],
        },
        {
          type: 'select',
          name: 'useSrc',
          message: 'Do you want to use the src folder?',
          choices: ['Yes', 'No'],
        },
      ]);

      const { language, database, useSrc } = answers;
      const folderStructure = useSrc=='Yes' ? 'src' : '';

      // Create folder structure
      await createFolderStructure(folderStructure, language);

      // Install dependencies
      installDependencies(database, language);
      console.log('Express app initialized successfully!');
    } catch (error) {
      console.error('Error initializing the Express app:', error);
    }
  });

program.parse(process.argv);

async function createFolderStructure(baseFolder, language) {
  const baseDir = baseFolder ? `${baseFolder}/` : '';
  const fileExtension = language === 'TypeScript' ? 'ts' : 'js';

  // Create basic folder structure
  fs.ensureDirSync(`${baseDir}controllers`);
  fs.ensureDirSync(`${baseDir}models`);
  fs.ensureDirSync(`${baseDir}routes`);
  fs.ensureDirSync(`${baseDir}config`);

  // Create basic app file
  const appFileContent = `
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/',(req,res)=>{
  return res.send('<h1>Welcome to Express App</h1>')
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
  `;
  fs.writeFileSync(`${baseDir}app.${fileExtension}`, appFileContent.trim());

  // Create package.json
  const packageJsonContent = {
    name: "your-project-name", // Replace with actual project name
    version: "1.0.0",
    description: "A brief description of your project",
    main: `app.${fileExtension}`,
    ...(language !== 'TypeScript' && { type: 'module' }),
    scripts: {
      start: language === 'TypeScript' ? "tsc && node dist/app.js" : "nodemon src/app.js",
      dev: language === 'TypeScript' ? "nodemon src/app.ts" : "nodemon src/app.js"
    },
    dependencies: {},
  };

  await fs.writeFileSync(`./package.json`, JSON.stringify(packageJsonContent, null, 2));

  if(language=='TypeScript'){
    const tsconfig={
      "compilerOptions": {
        "target": "es6",
        "module": "commonjs",
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "esModuleInterop": true
      }
    }
    await fs.writeFileSync(`./tsconfig.json`, JSON.stringify(tsconfig, null, 2));
    
  }
}

function installDependencies(database, language) {
  // Common dependencies
  let installCommand = 'npm install express cors dotenv body-parser';

  if (database === 'MongoDB') {
    installCommand += ' mongoose';
  } else if (database === 'MySQL') {
    installCommand += ' mysql2';
  }

  if (language === 'TypeScript') {
    installCommand += ' && npm install --save-dev typescript @types/express @types/node @types/cors ts-node nodemon';
  }

  // Run the install command
  execSync(installCommand, { stdio: 'inherit' });
}