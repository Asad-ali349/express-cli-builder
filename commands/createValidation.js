const { generate } = require('../lib/generators');

function createValidation(validationName, options = {}) {
  return generate(['validation'], validationName, options);
}

module.exports = createValidation;
