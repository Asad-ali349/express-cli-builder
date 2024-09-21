module.exports = (routeName) => `
const express = require('express');
const router = express.Router();
const ${routeName}Controller = require('../controllers/${routeName}.controller.js');

// Define your routes here
router.get('/', ${routeName}Controller.getAll);
router.post('/', ${routeName}Controller.create);

module.exports = router;
`;
