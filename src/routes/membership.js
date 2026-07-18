import express from 'express';
import membershipController from '../controller/membership.js';

const router = express.Router();

router.get('/register', membershipController.register);
router.post('/register', membershipController.store);

export default router;
