/** .env validation: config/env checks process.env with zod at startup. */
/** zod fields for a database's variables (empty for none). */
function databaseEnvFields(database) {
  if (database === 'MongoDB') return ['  CONNECTION_URL: z.string().min(1),'];
  if (database === 'MySQL') {
    return [
      '  DB_HOST: z.string().min(1),',
      '  DB_USER: z.string().min(1),',
      "  DB_PASSWORD: z.string().default(''),",
      '  DB_NAME: z.string().min(1),',
    ];
  }
  return [];
}

function envFile({ database }) {
  const fields = [
    "  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),",
    '  PORT: z.coerce.number().int().positive().default(3000),',
    ...databaseEnvFields(database),
  ];

  return `import 'dotenv/config';
import { z } from 'zod';

// Every environment variable the app reads. Add new ones here so a missing or
// invalid value stops the app at startup with a clear message.
const schema = z.object({
${fields.join('\n')}
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables (check your .env file):');
  for (const issue of parsed.error.issues) {
    console.error(\`  - \${issue.path.join('.')}: \${issue.message}\`);
  }
  process.exit(1);
}

export const env = parsed.data;
`;
}

module.exports = {
  databaseEnvFields,
  key: 'env',
  label: '.env validation (zod)',
  dependencies: () => ['zod@^4'],
  files: (o) => [{ path: `src/config/env.${o.ext}`, content: envFile(o) }],
  envLines: () => ['NODE_ENV=development'],
};
