import express from "express";
import { login, getProfile, logout, updateFcmToken } from "../controllers/authController.js";
import { verifyToken } from "../utils.js";

const router = express.Router();

router.post("/login", login);
router.get("/profile", verifyToken, getProfile);
router.get("/me", verifyToken, getProfile);
router.post("/update-fcm-token", verifyToken, updateFcmToken);
router.post("/logout", verifyToken, logout);

export default router;