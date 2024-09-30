module.exports = (modelName) => `
import mongoose from 'mongoose';

const ${modelName}Schema = new mongoose.Schema({
    // Define your schema fields here
});

module.exports = mongoose.model('${modelName}', ${modelName}Schema);
`;
