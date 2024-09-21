module.exports = (controllerName) => `
// const ${controllerName}Model = require('../models/${controllerName}.model.js');

exports.getAll = async (req, res) => {
    // Implement your logic to get all ${controllerName}s
};

exports.create = async (req, res) => {
    // Implement your logic to create a new ${controllerName}
};
`;
