const { generate } = require('../lib/generators');

function createController(controllerName, options = {}) {
  return generate(['controller'], controllerName, options);
}

module.exports = createController;
