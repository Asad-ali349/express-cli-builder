const path = require('path');

/** npm package names must be lowercase and URL-safe; derive one from the folder name. */
function projectNameFrom(cwd) {
  const name = path
    .basename(path.resolve(cwd))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|-+$/g, '');
  return name || 'express-app';
}

/**
 * Database connection module. With `useEnv` the values come from the
 * validated config/env module instead of process.env.
 */
function buildDbConfig({ database, useEnv = false, importExt = '' }) {
  const envImport = useEnv ? `import { env } from './env${importExt}';\n` : '';
  const source = useEnv ? 'env' : 'process.env';

  if (database === 'MongoDB') {
    const guard = useEnv
      ? ''
      : `  if (!url) {
    throw new Error('CONNECTION_URL is not set. Add it to your .env file.');
  }
`;
    return `import mongoose from 'mongoose';
${envImport}
export const connectDB = async () => {
  const url = ${source}.CONNECTION_URL;
${guard}  const conn = await mongoose.connect(url);
  console.log(\`MongoDB connected: \${conn.connection.host}\`);

  // Build indexes (for example unique fields) before the server accepts
  // requests, so constraints hold from the very first request. A model whose
  // index cannot be built (for example duplicates already exist) only warns.
  for (const model of Object.values(mongoose.models)) {
    try {
      await model.init();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(\`Could not build indexes for \${model.modelName}: \${reason}\`);
    }
  }
  return conn;
};
`;
  }
  return `import mysql from 'mysql2/promise';
${envImport}
export const pool = mysql.createPool({
  host: ${source}.DB_HOST,
  user: ${source}.DB_USER,
  password: ${source}.DB_PASSWORD,
  database: ${source}.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

export const connectDB = async () => {
  // Fail fast at startup if the database is unreachable.
  const connection = await pool.getConnection();
  connection.release();
  console.log(\`MySQL connected: \${${source}.DB_HOST}\`);
  return pool;
};
`;
}

function buildTsconfig({ useSrc, excludeTests = false }) {
  const exclude = ['node_modules', 'dist'];
  if (excludeTests) exclude.push('src/**/*.test.ts');
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      rootDir: useSrc ? './src' : '.',
      outDir: './dist',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: [useSrc ? 'src/**/*.ts' : '**/*.ts'],
    exclude,
  };
}

/** The .env block for a database (empty for none). */
function databaseEnvLines(cwd, database) {
  if (database === 'MongoDB') {
    return ['# MongoDB connection string', `CONNECTION_URL=mongodb://127.0.0.1:27017/${projectNameFrom(cwd)}`];
  }
  if (database === 'MySQL') {
    return ['# MySQL connection details', 'DB_HOST=localhost', 'DB_USER=root', 'DB_PASSWORD=', 'DB_NAME=your_database'];
  }
  return [];
}

function buildEnv({ cwd, database, extraLines = [] }) {
  const lines = ['# Server configuration', 'PORT=3000', ...extraLines];
  const dbLines = databaseEnvLines(cwd, database);
  if (dbLines.length > 0) lines.push('', ...dbLines);
  return lines.join('\n') + '\n';
}

const GITIGNORE = 'node_modules/\ndist/\ncoverage/\n.env\n';

const json = (value) => JSON.stringify(value, null, 2) + '\n';

module.exports = { projectNameFrom, buildDbConfig, buildTsconfig, buildEnv, databaseEnvLines, GITIGNORE, json };
