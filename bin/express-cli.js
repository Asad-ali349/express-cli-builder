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

// Add the help command
program
  .command('help')
  .description('Show help for all available commands')
  .action(() => {
    program.outputHelp(); // Show help output
  });


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
          name: 'useSrc',
          message: 'Do you want to use the src folder?',
          choices: ['Yes', 'No'],
        },
        {
          type: 'select',
          name: 'database',
          message: 'Would you like to use database?',
          choices: ['Yes', 'No'],
        },
      ]);

      const { language, useSrc, database } = answers;
      let databaseName = 'No';
      if(database === 'Yes'){
        const dbNameChoice = await enquirer.prompt([
          {
            type: 'select',
            name: 'databaseName',
            message: 'Which database would you like to use?',
            choices: ['MongoDB', 'MySQL'],
          },
        ]);
        databaseName= dbNameChoice.databaseName;
      }


      const folderStructure = useSrc=='Yes' ? 'src' : '';

      // Create folder structure
      await createFolderStructure(folderStructure, language, database, databaseName);

      // Install dependencies
      installDependencies(database, language, databaseName);
      console.log('Express app initialized successfully!');
    } catch (error) {
      console.error('Error initializing the Express app:', error);
    }
  });

program.parse(process.argv);

async function createFolderStructure(baseFolder, language , database, databaseName) {
  const baseDir = baseFolder ? `${baseFolder}/` : '';
  const fileExtension = language === 'TypeScript' ? 'ts' : 'js';

  // Create basic folder structure
  fs.ensureDirSync(`${baseDir}controllers`);
  if(database === 'Yes'){
    fs.ensureDirSync(`${baseDir}models`);
  }
  fs.ensureDirSync(`${baseDir}routes`);
  fs.ensureDirSync(`${baseDir}config`);

  // Create basic app file
  const appFileContent = `
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
${
database==='Yes' ? `import {connectDB} from './config/db.config.${fileExtension}';`:``
}

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/',(req,res)=>{
  res.send('<h1>Welcome to Express App</h1>')
})

const PORT = process.env.PORT || 3000;

${
 database ==='No'? 
`app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`
:
`
connectDB().then(() => {
  app.listen(PORT, () => {
      console.log(\`Server running on port: \${PORT}\`);
  });
}).catch((err) => {
  console.log('DB connection error', err);
});
`
}

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

  const dotEnvContent= `
# Database connection details for MySQL
DB_HOST=localhost        # The hostname of your MySQL database
DB_USER=root             # Your MySQL username
DB_PASSWORD=             # Your MySQL password
DB_NAME=your_database    # The name of your MySQL database

# Database connection details for Mongo
CONNECTION_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/test

# Server configuration
PORT=5000  # Port on which your Express server will run
`;

await fs.writeFileSync(`./.env`, dotEnvContent.trim());
  if(language=='TypeScript'){
    const tsconfig={
      "compilerOptions": {
        "target": "es6",
        "module": "commonjs",
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "esModuleInterop": true,
        "allowImportingTsExtensions": true,
        "noEmit": true
      }
    }
    await fs.writeFileSync(`./tsconfig.json`, JSON.stringify(tsconfig, null, 2));
    if(database==='Yes'){
      createConfig (baseDir,databaseName,'ts')
    }
  }else{
    if(database==='Yes'){
      createConfig (baseDir,databaseName,'js')
    }
  }

}

function createConfig(baseDir,databaseName, fileType) {
  const dbConfigs = {
    MongoDB: `
    // config/db.${fileType}
    import mongoose from 'mongoose';

    export const connectDB = async () => {
      try {
        const conn = await mongoose.connect(process.env.CONNECTION_URL ${fileType=='ts'?'as string':''});
        console.log(\`MongoDB Connected: \${conn.connection.host}\`);
        return conn;
      } catch (error) {
        console.error('Mongodb connection error', error);
        throw error;
      }
    };
    `,
    MySQL: `
    // config/db.${fileType}
    import mysql from 'mysql2/promise';

    export const connectDB = async () => {
      try {
        const connection = await mysql.createConnection({
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
        });

        console.log(\`MySQL Connected: \${connection.config.host}\`);
        return connection;
      } catch (error) {
        console.error('MySQL connection error', error);
        throw error;
      }
    };
    `,
  };

  // Check if the provided database name exists in the `dbConfigs` object
  const dbConfig = dbConfigs[databaseName];

  if (!dbConfig) {
    console.error('Unsupported database name provided!');
    return;
  }

  fs.writeFileSync(`${baseDir}config/db.config.${fileType}`, dbConfig.trim());

  console.log(`Configuration file for ${databaseName} has been created`);
}



function installDependencies(database, language, databaseName) {
  // Common dependencies
  let installCommand = 'npm install express cors dotenv body-parser';

  if (database === 'Yes' && databaseName === 'MongoDB') {
    installCommand += ' mongoose';
  } else if (database === 'Yes' && databaseName === 'MySQL') {
    installCommand += ' mysql2';
  }

  if (language === 'TypeScript') {
    installCommand += ' && npm install --save-dev typescript @types/express @types/node @types/cors ts-node nodemon';
  }

  // Run the install command
  execSync(installCommand, { stdio: 'inherit' });
}