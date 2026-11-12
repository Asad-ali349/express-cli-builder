const { errorsFile, errorMiddlewareFile } = require('../../templates/errorTemplates');
const { projectNameFrom, buildDbConfig, buildTsconfig, buildEnv, GITIGNORE, json } = require('./shared');

/** The single app file of a Small project. */
function buildAppFile({ isTs, database }) {
  // TypeScript resolves imports without an extension; native ESM needs ".js".
  const importExt = isTs ? '' : '.js';
  const dbImport = database ? `import { connectDB } from './config/db.config${importExt}';\n` : '';
  const dbConnect = database ? '  await connectDB();\n' : '';

  return `import 'dotenv/config';
import express from 'express';
import cors from 'cors';
${dbImport}import { errorHandler, notFound } from './middlewares/error.middleware${importExt}';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('<h1>Welcome to Express App</h1>');
});

// Keep these last: unknown routes get a 404, and any error becomes a JSON response.
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

const start = async () => {
${dbConnect}  app.listen(PORT, (error${isTs ? '?: Error' : ''}) => {
    if (error) {
      console.error(\`Failed to start server on port \${PORT}: \${error.message}\`);
      process.exit(1);
    }
    console.log(\`Server running on port \${PORT}\`);
  });
};

start().catch((error) => {
  console.error('Failed to start the application:', error);
  process.exit(1);
});
`;
}

function buildPackageJson({ cwd, isTs, baseDir }) {
  const pkg = {
    name: projectNameFrom(cwd),
    version: '1.0.0',
    description: '',
    private: true,
  };
  if (isTs) {
    pkg.main = 'dist/app.js';
    pkg.scripts = {
      dev: `tsx watch ${baseDir}app.ts`,
      build: 'tsc',
      start: 'tsc && node dist/app.js',
    };
  } else {
    pkg.main = `${baseDir}app.js`;
    pkg.type = 'module';
    pkg.scripts = {
      dev: `node --watch ${baseDir}app.js`,
      start: `node ${baseDir}app.js`,
    };
  }
  pkg.dependencies = {};
  return pkg;
}

function buildFiles(options) {
  const { baseDir, ext, isTs, database, importExt } = options;
  const project = { moduleType: isTs ? 'ts' : 'esm', importExt, imports: { errors: `../utils/errors${importExt}` } };

  const files = [
    { path: 'package.json', content: json(buildPackageJson(options)) },
    { path: `${baseDir}app.${ext}`, content: buildAppFile(options) },
    { path: `${baseDir}middlewares/error.middleware.${ext}`, content: errorMiddlewareFile(project) },
    { path: `${baseDir}utils/errors.${ext}`, content: errorsFile(project) },
    // Never replace these, even with --force: .env may hold real credentials.
    { path: '.env', content: buildEnv(options), keepExisting: true },
    { path: '.gitignore', content: GITIGNORE, keepExisting: true },
  ];
  if (isTs) files.push({ path: 'tsconfig.json', content: json(buildTsconfig(options)) });
  if (database) files.push({ path: `${baseDir}config/db.config.${ext}`, content: buildDbConfig(options) });
  return files;
}

function buildDirectories({ baseDir, database }) {
  const dirs = ['controllers', 'routes', 'config'];
  if (database) dirs.push('models');
  return dirs.map((dir) => `${baseDir}${dir}`);
}

module.exports = { buildFiles, buildDirectories, buildAppFile, buildPackageJson };
