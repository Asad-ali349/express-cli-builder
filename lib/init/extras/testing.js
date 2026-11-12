/**
 * vitest + supertest, with a first test for the app itself.
 * vitest is kept on v3: v4 and v5 fail to install with npm 10.9 (npm error
 * "Cannot read properties of null (reading 'edgesOut')"), even in an empty project.
 */
const appTest = ({ importExt }) => `import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './app${importExt}';

describe('app', () => {
  it('GET / answers 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  it('unknown routes answer 404 with a JSON message', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/);
  });
});
`;

module.exports = {
  key: 'testing',
  label: 'Testing (vitest + supertest)',
  devDependencies: (o) => ['vitest@^3', 'supertest@^7', ...(o.isTs ? ['@types/supertest@^7'] : [])],
  scripts: () => ({ test: 'vitest run', 'test:watch': 'vitest' }),
  files: (o) => [{ path: `src/app.test.${o.ext}`, content: appTest(o) }],
};
