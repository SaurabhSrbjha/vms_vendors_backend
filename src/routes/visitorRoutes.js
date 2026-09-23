import express from "express";
import {
  createVisitor,
  preRegisterVisitor,
  searchPreRegisteredVisitor,
  getVisitors,
  getVisitorById,
  updateVisitorStatus,
  approveVisitor,
  rejectVisitor,
} from "../controllers/visitorController.js";
import { verifyToken, optionalVerifyToken, requireRole } from "../utils.js";

const router = express.Router();

// Visitor Pre-Registration by Employee (Auto-Approved)
router.post(
  "/pre-register",
  verifyToken,
  requireRole("employee", "admin", "reception"),
  preRegisterVisitor
);

// Search Pre-Registered Visitor (Endpoint: GET /api/visitors/pre-register/search/:query)
router.get(
  "/pre-register/search/:query",
  optionalVerifyToken,
  searchPreRegisteredVisitor
);

// Handle empty query param (Validation Error 400)
router.get(
  "/pre-register/search",
  optionalVerifyToken,
  searchPreRegisteredVisitor
);

// Optional alias: GET /api/visitors/pre-register/:id
router.get(
  "/pre-register/:id",
  optionalVerifyToken,
  searchPreRegisteredVisitor
);

// Visitor Creation by Receptionist, Admin, or Employee
router.post(
  "/",
  verifyToken,
  requireRole("reception", "admin", "employee"),
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

// Employee (Host), Receptionist & Admin Approval / Rejection Routes (Body or URL Param)
router.patch(
  "/status",
  verifyToken,
  requireRole("employee", "admin", "reception"),
  updateVisitorStatus
);

router.post(
  "/approve",
  verifyToken,
  requireRole("employee", "admin", "reception"),
  approveVisitor
);

router.post(
  "/reject",
  verifyToken,
  requireRole("employee", "admin", "reception"),
  rejectVisitor
);

router.patch(
  "/:id/status",
  verifyToken,
  requireRole("employee", "admin", "reception"),
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
