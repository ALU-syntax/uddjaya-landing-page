import express from 'express';
import b2bController from '../controller/b2b.controller.js';

const router = express.Router();

router.get('/register', b2bController.register);
router.get('/regions', b2bController.regions);

export default router;
