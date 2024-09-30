module.exports = (controllerName) => `
// import ${controllerName}Model from '../models/${controllerName}.model.js';

exports.getAll = async (req, res) => {
    // Implement your logic to get all ${controllerName}s
};

exports.create = async (req, res) => {
    // Implement your logic to create a new ${controllerName}
};
`;
