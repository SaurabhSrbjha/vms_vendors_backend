import express from "express";
import authRoutes from "./authRoutes.js";
import employeeRoutes from "./employeeRoutes.js";
import visitorRoutes from "./visitorRoutes.js";
import { login } from "../controllers/authController.js";

const router = express.Router();

// Direct endpoint specified in prompt: POST /api/login
router.post("/login", login);

// Router modules
router.use("/auth", authRoutes);
router.use("/employees", employeeRoutes);
router.use("/visitors", visitorRoutes);

export default router;