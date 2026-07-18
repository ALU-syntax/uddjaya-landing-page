import express from 'express';
import membershipController from '../controller/membership.js';

const router = express.Router();

router.get('/register/:code', membershipController.register);
router.post('/register/:code', membershipController.store);

export default router;
