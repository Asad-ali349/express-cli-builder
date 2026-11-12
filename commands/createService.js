const { generate } = require('../lib/generators');

function createService(serviceName, options = {}) {
  return generate(['service'], serviceName, options);
}

module.exports = createService;
