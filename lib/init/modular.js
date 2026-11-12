const { errorsFile, errorMiddlewareFile } = require('../../templates/errorTemplates');
const { projectNameFrom, buildDbConfig, buildTsconfig, buildEnv, GITIGNORE, json } = require('./shared');
const { EXTRAS } = require('./extras');

const enabled = (options) => EXTRAS.filter((extra) => options.features.includes(extra.key));

/** src/app: builds the Express app and exports it (src/server starts it), so tests can import it. */
function buildModularApp({ features, importExt: x }) {
  const on = (key) => features.includes(key);
  const imports = ["import express from 'express';", "import cors from 'cors';"];
  if (on('security')) imports.push("import helmet from 'helmet';", "import { rateLimit } from 'express-rate-limit';");
  if (on('logger')) imports.push("import { pinoHttp } from 'pino-http';");
  if (on('swagger')) imports.push("import swaggerUi from 'swagger-ui-express';");
  imports.push(`import routes from './routes${x}';`);
  if (on('swagger')) imports.push(`import { openApiSpec } from './docs${x}';`);
  imports.push(`import { errorHandler, notFound } from './common/middlewares/error.middleware${x}';`);
  if (on('logger')) imports.push(`import { logger } from './common/utils/logger${x}';`);

  const middleware = [];
  if (on('security')) {
    middleware.push(
      'app.use(helmet());',
      "app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));"
    );
  }
  if (on('logger')) middleware.push('app.use(pinoHttp({ logger }));');
  middleware.push('app.use(cors());', 'app.use(express.json());');

  const docs = on('swagger') ? "app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));\n\n" : '';
  const mount = on('apiPrefix') ? "app.use('/api/v1', routes);" : 'app.use(routes);';

  return `${imports.join('\n')}

const app = express();

${middleware.join('\n')}

app.get('/', (req, res) => {
  res.send('<h1>Welcome to Express App</h1>');
});

${docs}// Every module's routes are registered in src/routes.
${mount}

// Keep these last: unknown routes get a 404, and any error becomes a JSON response.
app.use(notFound);
app.use(errorHandler);

export default app;
`;
}

/** src/server: loads configuration, connects the database and starts listening. */
function buildServer({ features, database, isTs, importExt: x }) {
  const on = (key) => features.includes(key);
  const imports = [on('env') ? `import { env } from './config/env${x}';` : "import 'dotenv/config';"];
  imports.push(`import app from './app${x}';`);
  if (database) imports.push(`import { connectDB } from './config/db.config${x}';`);
  if (on('logger')) imports.push(`import { logger } from './common/utils/logger${x}';`);

  const port = on('env') ? 'env.PORT' : 'Number(process.env.PORT) || 3000';
  const info = (message) => (on('logger') ? `logger.info(${message})` : `console.log(${message})`);
  const fail = (message, error) => (on('logger') ? `logger.error({ err: ${error} }, ${message})` : `console.error(${message}, ${error})`);

  return `${imports.join('\n')}

const PORT = ${port};

const start = async () => {
${database ? '  await connectDB();\n' : ''}  app.listen(PORT, (error${isTs ? '?: Error' : ''}) => {
    if (error) {
      ${fail("`Failed to start server on port ${PORT}`", 'error')};
      process.exit(1);
    }
    ${info('`Server running on port ${PORT}`')};
  });
};

start().catch((error) => {
  ${fail("'Failed to start the application'", 'error')};
  process.exit(1);
});
`;
}

/** src/routes: the registry that create:resource adds module routes to. */
const routesRegistry = () => `import { Router } from 'express';

const router = Router();

// Module routes are added above this line by "express create:resource".

export default router;
`;

function buildPackageJson(options) {
  const { cwd, isTs, features } = options;
  const pkg = {
    name: projectNameFrom(cwd),
    version: '1.0.0',
    description: '',
    private: true,
    main: isTs ? 'dist/server.js' : 'src/server.js',
  };
  if (!isTs) pkg.type = 'module';
  pkg.scripts = isTs
    ? { dev: 'tsx watch src/server.ts', build: 'tsc', start: 'tsc && node dist/server.js' }
    : { dev: 'node --watch src/server.js', start: 'node src/server.js' };
  for (const extra of enabled(options)) Object.assign(pkg.scripts, extra.scripts ? extra.scripts(options) : {});
  pkg.dependencies = {};
  // Lets later create:* commands know this is a modular project and which extras it has.
  pkg.expressCli = { structure: 'modular', features: [...features] };
  return pkg;
}

function buildFiles(options) {
  const { ext, isTs, database, features, importExt } = options;
  const project = {
    moduleType: isTs ? 'ts' : 'esm',
    importExt,
    useLogger: features.includes('logger'),
    imports: { errors: `../errors/app-error${importExt}`, logger: `../utils/logger${importExt}` },
  };
  const extras = enabled(options);
  const envLines = extras.flatMap((extra) => (extra.envLines ? extra.envLines(options) : []));

  const files = [
    { path: 'package.json', content: json(buildPackageJson(options)) },
    { path: `src/server.${ext}`, content: buildServer(options) },
    { path: `src/app.${ext}`, content: buildModularApp(options) },
    { path: `src/routes.${ext}`, content: routesRegistry() },
    { path: `src/common/errors/app-error.${ext}`, content: errorsFile(project) },
    { path: `src/common/middlewares/error.middleware.${ext}`, content: errorMiddlewareFile(project) },
    { path: '.env', content: buildEnv({ ...options, extraLines: envLines }), keepExisting: true },
    { path: '.gitignore', content: GITIGNORE, keepExisting: true },
  ];
  if (isTs) {
    files.push({ path: 'tsconfig.json', content: json(buildTsconfig({ useSrc: true, excludeTests: features.includes('testing') })) });
  }
  if (database) {
    files.push({
      path: `src/config/db.config.${ext}`,
      content: buildDbConfig({ database, useEnv: features.includes('env'), importExt }),
    });
  }
  for (const extra of extras) if (extra.files) files.push(...extra.files(options));
  return files;
}

const buildDirectories = () => ['src/modules'];

function packagesFor(options) {
  const extras = enabled(options);
  return {
    dependencies: extras.flatMap((extra) => (extra.dependencies ? extra.dependencies(options) : [])),
    devDependencies: extras.flatMap((extra) => (extra.devDependencies ? extra.devDependencies(options) : [])),
  };
}

module.exports = { buildFiles, buildDirectories, buildModularApp, buildServer, buildPackageJson, packagesFor };
