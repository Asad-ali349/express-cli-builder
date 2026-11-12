const { generate } = require('../lib/generators');

function createMiddleware(middlewareName, options = {}) {
  return generate(['middleware'], middlewareName, options);
}

module.exports = createMiddleware;
