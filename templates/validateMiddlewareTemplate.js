/**
 * Shared middleware used by every generated validation:
 *   router.post('/', validate(createUserSchema), create);
 */
module.exports = ({ moduleType }) => {
  const isTs = moduleType === 'ts';
  const isCjs = moduleType === 'cjs';

  const header = isTs
    ? "import { Request, Response, NextFunction } from 'express';\nimport { z } from 'zod';\n\n"
    : '';
  const signature = isTs ? '(schema: z.ZodType)' : '(schema)';
  const handlerArgs = isTs ? '(req: Request, res: Response, next: NextFunction)' : '(req, res, next)';
  const warnedType = isTs ? '<string>' : '';
  const decl = isCjs ? 'const validate =' : 'export const validate =';

  return `${header}// Routes already warned about an empty schema, so the log is not flooded.
const warned = new Set${warnedType}();

const hasNoFields = ${isTs ? '(schema: z.ZodType)' : '(schema)'} => {
  const shape = ${isTs ? '(schema as { shape?: Record<string, unknown> })' : 'schema'}.shape;
  return shape !== undefined && Object.keys(shape).length === 0;
};

/**
 * Validates req.body against a zod schema.
 * - Schema without fields: the endpoint is not finished yet, so 501 and nothing is saved.
 * - Invalid body: 400 with the list of problems.
 * - Nothing left after cleaning (only unknown or no fields): 400, so empty records are never saved.
 * - Otherwise req.body is replaced by the parsed data, which drops unknown fields.
 */
${decl} ${signature} => ${handlerArgs} => {
  const routePath = req.route ? req.route.path : req.path;
  const route = \`\${req.method} \${req.baseUrl}\${routePath === '/' && req.baseUrl ? '' : routePath}\`;
  if (hasNoFields(schema)) {
    if (!warned.has(route)) {
      warned.add(route);
      console.warn(
        \`[validate] Warning: the schema for \${route} has no fields, so it answers 501. Add fields to its file in the validations folder.\`
      );
    }
    res.status(501).json({ message: \`\${route} is not ready: its validation schema has no fields yet.\` });
    return;
  }

  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    res.status(400).json({
      message: 'Validation failed',
      errors: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    });
    return;
  }

  const data = result.data;
  if (data !== null && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) {
    res.status(400).json({ message: 'Request body has no valid fields' });
    return;
  }

  req.body = data;
  next();
};
${isCjs ? '\nmodule.exports = { validate };\n' : ''}`;
};
