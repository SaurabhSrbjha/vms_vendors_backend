import express from "express";
import {
  createVisitor,
  getVisitors,
  getVisitorById,
  updateVisitorStatus,
  approveVisitor,
  rejectVisitor,
} from "../controllers/visitorController.js";
import { verifyToken, requireRole } from "../utils.js";

const router = express.Router();

// Visitor Creation by Receptionist or Admin
router.post(
  "/",
  verifyToken,
  requireRole("reception", "admin"),
  createVisitor
);

// Get Visitors List (Admin & Reception see all, Employee sees assigned)
router.get(
  "/",
  verifyToken,
  requireRole("admin", "reception", "employee"),
  getVisitors
);

// Get Single Visitor Details
router.get(
  "/:id",
  verifyToken,
  requireRole("admin", "reception", "employee"),
  getVisitorById
);

// Employee (Host) & Admin Approval / Rejection Routes (Body or URL Param)
router.patch(
  "/status",
  verifyToken,
  requireRole("employee", "admin"),
  updateVisitorStatus
);

router.post(
  "/approve",
  verifyToken,
  requireRole("employee", "admin"),
  approveVisitor
);

router.post(
  "/reject",
  verifyToken,
  requireRole("employee", "admin"),
  rejectVisitor
);

router.patch(
  "/:id/status",
  verifyToken,
  requireRole("employee", "admin"),
  updateVisitorStatus
);

router.post(
  "/:id/approve",
  verifyToken,
  requireRole("employee", "admin"),
  approveVisitor
);

router.post(
  "/:id/reject",
  verifyToken,
  requireRole("employee", "admin"),
  rejectVisitor
);

export default router;
