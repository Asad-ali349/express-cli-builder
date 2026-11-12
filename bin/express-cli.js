#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const pkg = require('../package.json');
const createModel = require('../commands/createModel');
const createRoute = require('../commands/createRoute');
const createController = require('../commands/createController');
const createMiddleware = require('../commands/createMiddleware');
const createResource = require('../commands/createResource');
const createValidation = require('../commands/createValidation');
const createService = require('../commands/createService');
const { scaffold, installDependencies, getInstallCommands, EXTRAS } = require('../lib/init');

const program = new Command();

/** Reports failures on stderr and through the exit code instead of a stack trace. */
function handleErrors(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      // Enquirer rejects with an empty value when a prompt is cancelled (Ctrl+C).
      console.error(error && error.message ? `Error: ${error.message}` : 'Cancelled.');
      process.exitCode = 1;
    }
  };
}

const FORCE = ['-f, --force', 'overwrite files that already exist'];
const NO_MOUNT = ['--no-mount', 'do not register the route in the app file'];
const NO_INSTALL = ['--skip-install', 'do not install missing packages (zod, database driver); print the command instead'];
const MODULE = ['-m, --module <module>', 'put the file in this module (modular projects only)'];
const DATABASE = ['--database <database>', 'database to set up if the project has none (MongoDB or MySQL)'];

program
  .name('express')
  .description('Generate Express application components')
  .version(pkg.version, '-v, --version');

program
  .command('create:model <modelName>')
  .description('Create a new model')
  .option(...FORCE)
  .option(...MODULE)
  .option(...DATABASE)
  .option(...NO_INSTALL)
  .action(handleErrors((name, options) => createModel(name, { ...options, install: !options.skipInstall })));


program
  .command('create:route <routeName>')
  .description('Create a new route')
  .option(...FORCE)
  .option(...MODULE)
  .option(...NO_MOUNT)
  .option('--controller', 'also create the controller if it does not exist yet')
  .option('--no-controller', 'do not create a missing controller (route handlers are commented out)')
  .action(handleErrors(createRoute));

program
  .command('create:controller <controllerName>')
  .description('Create a new controller')
  .option(...FORCE)
  .option(...MODULE)
  .action(handleErrors(createController));

program
  .command('create:middleware <middlewareName>')
  .description('Create a new middleware')
  .option(...FORCE)
  .option(...MODULE)
  .action(handleErrors(createMiddleware));

program
  .command('create:validation <validationName>')
  .description('Create a new zod validation (installs zod if it is missing)')
  .option(...FORCE)
  .option(...MODULE)
  .option(...NO_INSTALL)
  .action(handleErrors((name, options) => createValidation(name, { ...options, install: !options.skipInstall })));

program
  .command('create:service <serviceName>')
  .description('Create a new service (modular projects only)')
  .option(...FORCE)
  .option(...MODULE)
  .action(handleErrors(createService));

program
  .command('create:resource <resourceName>')
  .description('Create a new resource with model, validation, route, and controller')
  .option(...FORCE)
  .option(...NO_MOUNT)
  .option(...NO_INSTALL)
  .option('--docs', 'add Swagger docs for this module without asking (modular projects with Swagger)')
  .option('--no-docs', 'do not add Swagger docs for this module')
  .option('--tests', 'add tests for this module without asking (modular projects with Testing)')
  .option('--no-tests', 'do not add tests for this module')
  .option(...DATABASE)
  .action(handleErrors((name, options) => createResource(name, { ...options, install: !options.skipInstall })));

program
  .command('init')
  .description('Initialize a new Express project in the current directory')
  .option('-f, --force', 'overwrite an existing project (.env and .gitignore are always kept)')
  .option('--skip-install', 'create the files without running npm install')
  .action(handleErrors(initProject));

async function initProject(options) {
  const cwd = process.cwd();
  if (!options.force && fs.existsSync(path.join(cwd, 'package.json'))) {
    throw new Error(
      'This directory already contains a package.json. Run "express init" in an empty directory, or pass --force to overwrite it.'
    );
  }

  // Loaded lazily so the create:* commands do not pay for the prompt library.
  const Enquirer = require('enquirer');
  const enquirer = new Enquirer();

  const { size } = await enquirer.prompt({
    type: 'select',
    name: 'size',
    message: 'How big is this project?',
    choices: [
      { name: 'small', message: 'Small (simple structure)' },
      { name: 'large', message: 'Large (modular, scalable)' },
    ],
  });
  const { language } = await enquirer.prompt({
    type: 'select',
    name: 'language',
    message: 'Would you like to use TypeScript or JavaScript?',
    choices: ['TypeScript', 'JavaScript'],
  });
  // Large projects always use src.
  let useSrc = true;
  if (size === 'small') {
    const answer = await enquirer.prompt({
      type: 'select',
      name: 'useSrc',
      message: 'Do you want to use the src folder?',
      choices: ['Yes', 'No'],
    });
    useSrc = answer.useSrc === 'Yes';
  }
  const { database } = await enquirer.prompt({
    type: 'select',
    name: 'database',
    message: 'Which database would you like to use?',
    choices: ['MongoDB', 'MySQL', 'None'],
  });
  let features = [];
  if (size === 'large') {
    const answer = await enquirer.prompt({
      type: 'multiselect',
      name: 'features',
      message: 'Which extras do you want? (space to select, enter to confirm; none is fine)',
      choices: EXTRAS.map((extra) => ({ name: extra.key, message: extra.label })),
    });
    features = answer.features;
  }

  const settings = {
    cwd,
    size,
    language,
    useSrc,
    database: database === 'None' ? null : database,
    features,
    force: Boolean(options.force),
  };

  scaffold(settings);
  console.log('Project files created.');

  if (options.skipInstall) {
    console.log('Skipped dependency installation. To install later, run:');
    for (const args of getInstallCommands(settings)) console.log(`  npm ${args.join(' ')}`);
    return;
  }
  installDependencies(settings);
  console.log('Express app initialized successfully! Start it with "npm run dev".');
  if (size === 'large') {
    console.log('Add your first module with: express create:resource <name>');
  }
}

program.parseAsync(process.argv);
