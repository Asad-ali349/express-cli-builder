module.exports = (routeName, fileExtension) => `
import express from 'express';
const router = express.Router();
import { getAll, create } from '../controllers/${routeName}.controller.${fileExtension}';

// Define your routes here
router.get('/', getAll);
router.post('/', create);

export default router;
`;
