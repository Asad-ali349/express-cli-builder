const test = require('node:test');
const assert = require('node:assert/strict');
const { validateName, toPascalCase, toCamelCase, toSnakeCase } = require('../lib/utils');

test('validateName accepts simple, hyphenated and underscored names', () => {
  for (const name of ['user', 'User', 'user-profile', 'user_profile', 'apiV2']) {
    assert.equal(validateName(name), name);
  }
});

test('validateName rejects path traversal and unsafe characters', () => {
  const bad = ['../evil', '../../../escaped', 'a/b', 'a\\b', '.hidden', 'user.model', 'has space', '1user', '-user', '', "x';process.exit()//", undefined];
  for (const name of bad) {
    assert.throws(() => validateName(name, 'model name'), /Invalid model name/, `should reject ${JSON.stringify(name)}`);
  }
});

test('case helpers turn any accepted name into usable identifiers', () => {
  assert.equal(toPascalCase('user-profile'), 'UserProfile');
  assert.equal(toPascalCase('user_profile'), 'UserProfile');
  assert.equal(toPascalCase('userProfile'), 'UserProfile');
  assert.equal(toPascalCase('user'), 'User');
  assert.equal(toCamelCase('user-profile'), 'userProfile');
  assert.equal(toCamelCase('User'), 'user');
  assert.equal(toSnakeCase('user-profile'), 'user_profile');
  assert.equal(toSnakeCase('UserProfile'), 'user_profile');
});
