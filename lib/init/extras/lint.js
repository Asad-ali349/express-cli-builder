/** ESLint (flat config) + Prettier. */
function eslintConfig({ isTs }) {
  const unused = isTs ? '@typescript-eslint/no-unused-vars' : 'no-unused-vars';
  return `import js from '@eslint/js';
import globals from 'globals';
${isTs ? "import tseslint from 'typescript-eslint';\n" : ''}import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
${isTs ? '  ...tseslint.configs.recommended,\n' : ''}  {
    languageOptions: { globals: globals.node },
    rules: {
      // Arguments starting with _ may stay unused (Express error handlers need four).
      '${unused}': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Turns off rules that would fight with Prettier's formatting.
  prettier,
];
`;
}

const PRETTIERRC = JSON.stringify({ singleQuote: true, printWidth: 120 }, null, 2) + '\n';

module.exports = {
  key: 'lint',
  label: 'ESLint + Prettier',
  devDependencies: (o) => [
    'eslint@^9',
    '@eslint/js@^9',
    'globals@^17',
    'prettier@^3',
    'eslint-config-prettier@^10',
    ...(o.isTs ? ['typescript-eslint@^8'] : []),
  ],
  scripts: () => ({ lint: 'eslint .', format: 'prettier --write .' }),
  files: (o) => [
    { path: 'eslint.config.mjs', content: eslintConfig(o) },
    { path: '.prettierrc', content: PRETTIERRC },
    { path: '.prettierignore', content: 'dist/\ncoverage/\nnode_modules/\npackage-lock.json\n' },
  ],
};
