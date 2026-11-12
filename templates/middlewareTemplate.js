module.exports = (middlewareName, { moduleType }) => {
  const body = `  // TODO: implement the ${middlewareName} middleware
  next();
};
`;

  if (moduleType === 'ts') {
    return `import { Request, Response, NextFunction } from 'express';

export default (req: Request, res: Response, next: NextFunction) => {
${body}`;
  }
  if (moduleType === 'esm') {
    return `export default (req, res, next) => {
${body}`;
  }
  return `module.exports = (req, res, next) => {
${body}`;
};
