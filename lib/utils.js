const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Names end up in file paths and in generated source code, so only allow
 * letters, digits, "-" and "_" (no path separators, dots or spaces).
 */
function validateName(name, kind = 'name') {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid ${kind} "${name}". Use letters, digits, "-" or "_" and start with a letter (e.g. "user" or "user-profile").`
    );
  }
  return name;
}

function splitWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean);
}

/** "user-profile" -> "UserProfile" */
function toPascalCase(name) {
  return splitWords(name)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/** "user-profile" -> "userProfile" */
function toCamelCase(name) {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** "user-profile" / "UserProfile" -> "user_profile" */
function toSnakeCase(name) {
  return splitWords(name)
    .map((word) => word.toLowerCase())
    .join('_');
}

module.exports = { validateName, toPascalCase, toCamelCase, toSnakeCase };
