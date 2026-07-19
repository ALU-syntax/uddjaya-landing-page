import express from 'express';
import membershipController from '../controller/membership.controller.js';

const router = express.Router();

router.get('/register/:code', membershipController.register);
router.get('/register/:code/communities', membershipController.communities);
router.get('/register/:code/referral', membershipController.referral);
router.post('/register/:code', membershipController.store);

export default router;
