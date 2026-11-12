const { toPascalCase, toSnakeCase } = require('../lib/utils');
const { importFrom } = require('./imports');

function mongooseModel(modelName, { moduleType }) {
  const className = toPascalCase(modelName);
  const schema = `const ${className}Schema = new mongoose.Schema(
  {
    // Define your schema fields here
  },
  { timestamps: true }
);
`;

  if (moduleType === 'cjs') {
    return `const mongoose = require('mongoose');

${schema}
module.exports = mongoose.model('${className}', ${className}Schema);
`;
  }
  return `import mongoose from 'mongoose';

${schema}
export default mongoose.model('${className}', ${className}Schema);
`;
}

function mysqlModel(modelName, project) {
  const { moduleType } = project;
  const table = toSnakeCase(modelName);
  const configPath = importFrom(project, 'dbConfig', '../config/db.config');
  const isTs = moduleType === 'ts';
  const isCjs = moduleType === 'cjs';
  const decl = isCjs ? 'const' : 'export const';
  const rows = isTs ? '<RowDataPacket[]>' : '';
  const header = isTs ? '<ResultSetHeader>' : '';
  const id = isTs ? 'id: Id' : 'id';
  const data = isTs ? 'data: Record<string, unknown>' : 'data';

  const lines = [];
  if (isTs) lines.push("import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';");
  lines.push(isCjs ? `const { pool } = require('${configPath}');` : `import { pool } from '${configPath}';`);
  lines.push(
    '',
    '// Expects config/db.config to export a mysql2 `pool` (created by `express init`)',
    '// and the table to have an auto-increment `id` primary key.',
    `const TABLE = '${table}';`
  );
  if (isTs) lines.push('', 'type Id = number | string;');
  lines.push(
    '',
    `${decl} findAll = async () => {`,
    `  const [rows] = await pool.query${rows}('SELECT * FROM ??', [TABLE]);`,
    '  return rows;',
    '};',
    '',
    `${decl} findById = async (${id}) => {`,
    `  const [rows] = await pool.query${rows}('SELECT * FROM ?? WHERE id = ?', [TABLE, id]);`,
    '  return rows[0] ?? null;',
    '};',
    '',
    `${decl} create = async (${data}) => {`,
    '  // Never insert an empty row (it would also be invalid SQL).',
    "  if (Object.keys(data).length === 0) throw new Error('create() needs at least one field');",
    `  const [result] = await pool.query${header}('INSERT INTO ?? SET ?', [TABLE, data]);`,
    '  return findById(result.insertId);',
    '};',
    '',
    `${decl} update = async (${id}, ${data}) => {`,
    '  // Nothing to change: return the record as it is.',
    '  if (Object.keys(data).length === 0) return findById(id);',
    `  const [result] = await pool.query${header}('UPDATE ?? SET ? WHERE id = ?', [TABLE, data, id]);`,
    '  return result.affectedRows > 0 ? findById(id) : null;',
    '};',
    '',
    `${decl} remove = async (${id}) => {`,
    `  const [result] = await pool.query${header}('DELETE FROM ?? WHERE id = ?', [TABLE, id]);`,
    '  return result.affectedRows > 0;',
    '};',
    '',
    `${isCjs ? 'module.exports =' : 'export default'} { findAll, findById, create, update, remove };`
  );
  return lines.join('\n') + '\n';
}

module.exports = (modelName, project) =>
  project.database === 'MySQL' ? mysqlModel(modelName, project) : mongooseModel(modelName, project);
