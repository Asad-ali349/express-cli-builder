const { importFrom, importLine } = require('./imports');

/** AppError and its common subclasses. Throw these anywhere; the error middleware turns them into responses. */
function errorsFile({ moduleType }) {
  const isTs = moduleType === 'ts';
  const isCjs = moduleType === 'cjs';
  const decl = isCjs ? 'class' : 'export class';
  const field = isTs ? '  readonly statusCode: number;\n\n' : '';
  const statusArg = isTs ? 'statusCode: number, message: string' : 'statusCode, message';
  const msg = (fallback) => (isTs ? `message: string = '${fallback}'` : `message = '${fallback}'`);

  return `${decl} AppError extends Error {
${field}  constructor(${statusArg}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
  }
}

${decl} BadRequestError extends AppError {
  constructor(${msg('Bad request')}) {
    super(400, message);
  }
}

${decl} NotFoundError extends AppError {
  constructor(${msg('Resource not found')}) {
    super(404, message);
  }
}
${isCjs ? '\nmodule.exports = { AppError, BadRequestError, NotFoundError };\n' : ''}`;
}

/** notFound (404 for unknown routes) and errorHandler (turns any error into a JSON response). */
function errorMiddlewareFile(project) {
  const { moduleType, useLogger = false } = project;
  const isTs = moduleType === 'ts';
  const isCjs = moduleType === 'cjs';
  const decl = isCjs ? 'const' : 'export const';

  const imports = [];
  if (isTs) imports.push("import { NextFunction, Request, Response } from 'express';");
  imports.push(importLine(project, '{ AppError }', importFrom(project, 'errors', '../utils/errors')));
  if (useLogger) imports.push(importLine(project, '{ logger }', importFrom(project, 'logger', '../utils/logger')));

  const t = (annotation) => (isTs ? `: ${annotation}` : '');
  const log = useLogger ? 'logger.error({ err: error }, message)' : 'console.error(error)';

  return `${imports.join('\n')}
${isTs ? `
type HttpError = { status: number; message: string; errors?: { path: string; message: string }[] };

// Shape of the errors thrown by mongoose, mysql2 and Express' JSON parser.
type KnownError = {
  name?: string;
  type?: string;
  code?: string | number;
  status?: number;
  path?: string;
  message?: string;
  errors?: Record<string, { path: string; message: string }>;
};
` : ''}
${decl} notFound = (req${t('Request')}, res${t('Response')}) => {
  res.status(404).json({ message: \`Route \${req.method} \${req.originalUrl} not found\` });
};

const toHttpError = (error${t('unknown')})${t('HttpError')} => {
  if (error instanceof AppError) return { status: error.statusCode, message: error.message };

  const known = (error ?? {})${isTs ? ' as KnownError' : ''};
  if (known.name === 'CastError') return { status: 400, message: \`Invalid \${known.path}\` };
  if (known.name === 'ValidationError' && known.errors) {
    return {
      status: 400,
      message: 'Validation failed',
      errors: Object.values(known.errors).map((item) => ({ path: item.path, message: item.message })),
    };
  }
  if (known.code === 11000 || known.code === 'ER_DUP_ENTRY') return { status: 409, message: 'Duplicate value' };
  if (known.type === 'entity.parse.failed') return { status: 400, message: 'Malformed JSON in request body' };
  if (typeof known.status === 'number' && known.status >= 400 && known.status < 500) {
    return { status: known.status, message: known.message || 'Bad request' };
  }

  // Never send internal details (database errors, stack traces) to clients;
  // the full error is logged on the server instead.
  return { status: 500, message: 'Internal server error' };
};

// Express recognises error handlers by their four arguments, so _next must stay.
${decl} errorHandler = (error${t('unknown')}, req${t('Request')}, res${t('Response')}, _next${t('NextFunction')}) => {
  const { status, message, errors } = toHttpError(error);
  if (status >= 500) ${log};
  res.status(status).json(errors ? { message, errors } : { message });
};
${isCjs ? '\nmodule.exports = { notFound, errorHandler };\n' : ''}`;
}

module.exports = { errorsFile, errorMiddlewareFile };
