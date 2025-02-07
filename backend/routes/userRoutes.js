import express from 'express';
import { getUserProfile, updateUserProfile, deleteUserAccount } from '../controllers/userController.js';
import { authenticateUser } from './authMiddleware.js';

const router = express.Router();

// ====== USER ROUTES ====== //

// Get user profile
router.get('/profile', authenticateUser, getUserProfile);

// Update user profile
router.put('/profile', authenticateUser, updateUserProfile);

// Delete user account
router.delete('/account', authenticateUser, deleteUserAccount);

export default router;