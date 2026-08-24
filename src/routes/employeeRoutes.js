import express from "express";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  toggleEmployeeStatus,
  deleteEmployee,
} from "../controllers/employeeController.js";
import { verifyToken, requireRole } from "../utils.js";

const router = express.Router();

// GET endpoints allowed for admin, reception, and employee roles (for dropdown selection)
router.get("/", verifyToken, requireRole("admin", "reception", "employee"), getEmployees);
router.get("/:id", verifyToken, requireRole("admin", "reception", "employee"), getEmployeeById);

// Admin-only management endpoints
router.post("/", verifyToken, requireRole("admin"), createEmployee);
router.put("/:id", verifyToken, requireRole("admin"), updateEmployee);
router.patch("/:id/status", verifyToken, requireRole("admin"), toggleEmployeeStatus);
router.delete("/:id", verifyToken, requireRole("admin"), deleteEmployee);

export default router;

