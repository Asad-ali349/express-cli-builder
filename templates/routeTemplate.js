module.exports = (routeName) => `
import express from 'express';
const router = express.Router();
import ${routeName}Controller from '../controllers/${routeName}.controller.js';

// Define your routes here
router.get('/', ${routeName}Controller.getAll);
router.post('/', ${routeName}Controller.create);

module.exports = router;
`;
