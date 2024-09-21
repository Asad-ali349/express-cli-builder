const createModel = require('./createModel');
const createRoute = require('./createRoute');
const createController = require('./createController');

function createResource(resourceName) {
  createModel(resourceName);
  createRoute(resourceName);
  createController(resourceName);
  console.log(`Resource ${resourceName} created successfully with model, route, and controller!`);
}

module.exports = createResource;
