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

// All employee management routes are protected and require Admin role
router.use(verifyToken, requireRole("admin"));

router.get("/", getEmployees);
router.get("/:id", getEmployeeById);
router.post("/", createEmployee);
router.put("/:id", updateEmployee);
router.patch("/:id/status", toggleEmployeeStatus);
router.delete("/:id", deleteEmployee);

export default router;

