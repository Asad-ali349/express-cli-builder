module.exports = (modelName) => `
const mongoose = require('mongoose');

const ${modelName}Schema = new mongoose.Schema({
    // Define your schema fields here
});

module.exports = mongoose.model('${modelName}', ${modelName}Schema);
`;
