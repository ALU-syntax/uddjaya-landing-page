import express from 'express';
import membershipController from '../controller/membership.controller.js';

const router = express.Router();

router.get('/register', membershipController.register);
router.get('/register/communities', membershipController.communities);
router.get('/register/referral', membershipController.referral);
router.get('/register/finish', membershipController.finish);
router.post('/register', membershipController.store);

export default router;
