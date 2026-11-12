const { toCamelCase, toPascalCase } = require('../lib/utils');
const { importFrom } = require('./imports');

/**
 * API tests for one module with vitest + supertest. The service is mocked, so
 * the tests check routing, validation and responses without a database.
 */
module.exports = (name, project) => {
  const { apiPrefix = '' } = project;
  const servicePath = importFrom(project, 'service', `../services/${name}.service`);
  const appPath = importFrom(project, 'app', '../../../app');
  const validatePath = importFrom(project, 'validateMiddleware', '../../../common/middlewares/validate.middleware');
  const service = `${toCamelCase(name)}Service`;
  const label = toPascalCase(name);
  const base = `${apiPrefix}/${name}`;

  return `import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '${appPath}';
import * as ${service} from '${servicePath}';

// Validation is replaced by a pass-through here, so these tests cover routing,
// controller and service. Test your validation schema in its own test.
vi.mock('${validatePath}', () => ({
  validate: () => (req, res, next) => next(),
}));

vi.mock('${servicePath}', () => ({
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

const service = vi.mocked(${service});
const item = { id: '1' };

describe('${label} API (${base})', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET ${base} returns all records', async () => {
    service.findAll.mockResolvedValue([item]);
    const res = await request(app).get('${base}');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([item]);
  });

  it('GET ${base}/:id returns one record', async () => {
    service.findById.mockResolvedValue(item);
    const res = await request(app).get('${base}/1');
    expect(res.status).toBe(200);
    expect(service.findById).toHaveBeenCalledWith('1');
  });

  it('POST ${base} creates a record', async () => {
    service.create.mockResolvedValue(item);
    const res = await request(app).post('${base}').send({ name: 'example' });
    expect(res.status).toBe(201);
  });

  it('PUT ${base}/:id updates a record', async () => {
    service.update.mockResolvedValue(item);
    const res = await request(app).put('${base}/1').send({ name: 'example' });
    expect(res.status).toBe(200);
  });

  it('DELETE ${base}/:id deletes a record', async () => {
    service.remove.mockResolvedValue(undefined);
    const res = await request(app).delete('${base}/1');
    expect(res.status).toBe(200);
    expect(service.remove).toHaveBeenCalledWith('1');
  });

  it('answers 400 for malformed JSON', async () => {
    const res = await request(app).post('${base}').set('Content-Type', 'application/json').send('{"broken"');
    expect(res.status).toBe(400);
  });
});
`;
};
