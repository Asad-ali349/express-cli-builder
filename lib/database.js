const fs = require('fs');
const path = require('path');
const { detectProject } = require('./project');
const { isModular, sharedFile, importSpecifier } = require('./layout');
const { ensurePackage } = require('./install');
const { choose } = require('./prompt');
const { buildDbConfig, databaseEnvLines } = require('./init/shared');
const { databaseEnvFields } = require('./init/extras/env');

const DATABASES = ['MongoDB', 'MySQL'];
const DRIVERS = { MongoDB: { name: 'mongoose', range: '^9' }, MySQL: { name: 'mysql2', range: '^3' } };
const ENV_KEY = { MongoDB: 'CONNECTION_URL', MySQL: 'DB_HOST' };
const IMPORT_LINE = /^(import\s.+|(const|let|var)\s.+=\s*require\(.+\);?)\s*$/;

/** The file that starts the server: src/server in modular projects, the app file in small ones. */
function startupFile(project) {
  const names = isModular(project) ? ['server'] : ['app', 'index', 'server'];
  return names.map((name) => path.join(project.baseDir, `${name}.${project.ext}`)).find((file) => fs.existsSync(file)) || null;
}

/** Adds the connectDB import and call to the startup file. Returns 'wired', 'already' or null. */
function wireConnectDB(source, importLine) {
  if (/\bconnectDB\b/.test(source)) return { status: 'already', source };
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^const start = async \(\) => \{\s*$/.test(line));
  let lastImport = -1;
  lines.forEach((line, index) => {
    if (IMPORT_LINE.test(line)) lastImport = index;
  });
  if (start === -1 || lastImport === -1) return { status: null, source };

  lines.splice(start + 1, 0, '  await connectDB();');
  lines.splice(lastImport + 1, 0, importLine);
  return { status: 'wired', source: lines.join('\n') };
}

/**
 * Sets up a database for a project that has none (asking which one), so that
 * models can be generated for it. Returns the database plus an `install`
 * function to call after the generated files are written, so a failed install
 * never loses them. Does nothing when the project already has a database.
 */
async function ensureDatabase(cwd, options = {}) {
  const project = detectProject(cwd);
  if (project.database) return { database: project.database, install: () => {} };

  const database = await choose(
    options,
    'database',
    'This project has no database yet. Which one should models use?',
    DATABASES,
    'This project has no database yet. Pass --database MongoDB or --database MySQL.'
  );
  const report = (line) => console.log(line);
  const rel = (file) => path.relative(cwd, file);
  const manual = [];

  if (project.moduleType === 'cjs') {
    manual.push(`Create a config/db.config file that exports connectDB for ${database}, and call it before app.listen().`);
  } else {
    // 1. config/db.config
    const configFile = sharedFile(project, 'dbConfig');
    const envFile = sharedFile(project, 'env');
    const useEnv = Boolean(envFile && fs.existsSync(envFile));
    if (fs.existsSync(configFile)) {
      report(`Kept existing ${rel(configFile)}`);
    } else {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.writeFileSync(configFile, buildDbConfig({ database, useEnv, importExt: project.importExt }));
      report(`Created database config: ${rel(configFile)}`);
    }

    // 2. connect at startup
    const startup = startupFile(project);
    const importLine = startup ? `import { connectDB } from '${importSpecifier(startup, configFile, project)}';` : '';
    const wired = startup ? wireConnectDB(fs.readFileSync(startup, 'utf8'), importLine) : { status: null };
    if (wired.status === 'wired') {
      fs.writeFileSync(startup, wired.source);
      report(`Connected the database at startup in ${rel(startup)}`);
    } else if (wired.status === null) {
      manual.push(`Import connectDB from config/db.config in your startup file and run "await connectDB();" before app.listen().`);
    }

    // 3. validated environment (the .env validation extra)
    if (useEnv) {
      const source = fs.readFileSync(envFile, 'utf8');
      if (!source.includes(`${ENV_KEY[database]}:`)) {
        const lines = source.split('\n');
        const portLine = lines.findIndex((line) => /^\s*PORT:/.test(line));
        if (portLine === -1) {
          manual.push(`Add to the schema in ${rel(envFile)}:\n${databaseEnvFields(database).join('\n')}`);
        } else {
          lines.splice(portLine + 1, 0, ...databaseEnvFields(database));
          fs.writeFileSync(envFile, lines.join('\n'));
          report(`Added the ${database} variables to ${rel(envFile)}`);
        }
      }
    }
  }

  // 4. .env (appended, never replaced)
  const dotEnv = path.join(cwd, '.env');
  const current = fs.existsSync(dotEnv) ? fs.readFileSync(dotEnv, 'utf8') : '';
  if (!new RegExp(`^${ENV_KEY[database]}=`, 'm').test(current)) {
    const block = databaseEnvLines(cwd, database).join('\n');
    const separator = current === '' || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
    fs.writeFileSync(dotEnv, `${current}${separator}${block}\n`);
    report(`Added the ${database} settings to .env (edit them to match your server)`);
  }

  if (fs.existsSync(path.join(cwd, 'docker-compose.yml'))) {
    manual.push(`docker-compose.yml has no ${database} service yet; add one if you run the app with Docker.`);
  }
  for (const line of manual) console.log(`Note: ${line}`);

  const driver = DRIVERS[database];
  return {
    database,
    install: () => ensurePackage(cwd, driver.name, driver.range, { run: options.runNpm, skip: options.install === false }),
  };
}

module.exports = { ensureDatabase, wireConnectDB, DATABASES };
