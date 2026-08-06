import pool from "../config/db.js";
import { saveBase64Image, generateAutoVisitorId } from "../utils.js";

/**
 * Create Visitor (Receptionist / Admin)
 * Receives Base64 photo, visitor details, and host employee info.
 */
export const createVisitor = async (req, res) => {
  try {
    const {
      photo,
      fullName,
      full_name,
      email,
      mobile,
      officeName,
      office_name,
      hostEmployeeId,
      host_employee_id,
      hostEmployeeName,
      host_employee_name,
      hostDepartment,
      host_department,
      purpose,
      visitorType,
      visitor_type,
      notes,
    } = req.body;

    const vFullName = (fullName || full_name || "").trim();
    const vMobile = (mobile || "").trim();
    const vHostEmpId = (hostEmployeeId || host_employee_id || "").trim();
    const vEmail = (email || "").trim();
    const vOfficeName = (officeName || office_name || "").trim();
    const vPurpose = (purpose || "").trim();
    const vVisitorType = (visitorType || visitor_type || "").trim();
    const vNotes = (notes || "").trim();

    if (!vFullName || !vMobile || !vHostEmpId) {
      return res.status(400).json({
        success: false,
        message: "fullName, mobile, and hostEmployeeId are required fields.",
      });
    }

    // Auto-fetch host details from employees table if missing
    let finalHostName = (hostEmployeeName || host_employee_name || "").trim();
    let finalHostDept = (hostDepartment || host_department || "").trim();

    if (!finalHostName || !finalHostDept) {
      const empRes = await pool.query(
        "SELECT full_name, department FROM employees WHERE employee_id = $1",
        [vHostEmpId]
      );
      if (empRes.rows.length > 0) {
        if (!finalHostName) finalHostName = empRes.rows[0].full_name;
        if (!finalHostDept) finalHostDept = empRes.rows[0].department;
      }
    }

    // Generate Auto Visitor ID (e.g. VIS1001)
    const visitorId = await generateAutoVisitorId();

    // Save Base64 Photo if provided
    let photoPath = null;
    if (photo) {
      photoPath = saveBase64Image(photo, "visitors");
    }

    // Receptionist info from logged in user token if available
    const receptionistId = req.user?.employee_id || req.user?.username || null;
    const receptionistName = req.user?.full_name || req.user?.username || null;

    const insertQuery = `
      INSERT INTO visitors (
        visitor_id, photo, full_name, email, mobile, office_name,
        host_employee_id, host_employee_name, host_department,
        purpose, visitor_type, notes, status, receptionist_id, receptionist_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', $13, $14)
      RETURNING *;
    `;

    const { rows } = await pool.query(insertQuery, [
      visitorId,
      photoPath,
      vFullName,
      vEmail,
      vMobile,
      vOfficeName,
      vHostEmpId,
      finalHostName,
      finalHostDept,
      vPurpose,
      vVisitorType,
      vNotes,
      receptionistId,
      receptionistName,
    ]);

    return res.status(201).json({
      success: true,
      message: "Visitor created successfully and sent for host approval.",
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ Error creating visitor:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating visitor.",
      error: error.message,
    });
  }
};

/**
 * Update Visitor Status (Approve / Reject)
 * Employee can approve/reject visitor requests assigned to them as host.
 * Admin can approve/reject any visitor request.
 * Supports passing visitor_id / id via URL param or request body.
 */
export const updateVisitorStatus = async (req, res) => {
  try {
    const targetId = req.params?.id || req.params?.visitorId || req.body?.visitor_id || req.body?.visitorId;
    const { status, notes, rejection_reason } = req.body;

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: "visitor_id or id is required to update status.",
      });
    }

    if (!status || !["APPROVED", "REJECTED", "PENDING", "CHECKED_IN", "CHECKED_OUT"].includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Valid status ('APPROVED' or 'REJECTED') is required.",
      });
    }

    const newStatus = status.toUpperCase();

    // Search by visitor_id first, fallback to numeric primary key id
    const isNumeric = /^\d+$/.test(targetId);
    const findQuery = isNumeric
      ? "SELECT * FROM visitors WHERE visitor_id = $1 OR id = $2"
      : "SELECT * FROM visitors WHERE visitor_id = $1";
    const findParams = isNumeric ? [targetId, parseInt(targetId, 10)] : [targetId];

    const { rows } = await pool.query(findQuery, findParams);
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Visitor not found with visitor_id/ID '${targetId}'.`,
      });
    }

    const visitor = rows[0];

    // If user is employee, verify host ID match
    if (req.user.role === "employee") {
      if (visitor.host_employee_id !== req.user.employee_id) {
        return res.status(403).json({
          success: false,
          message: "Forbidden. You can only approve or reject visitors assigned to you.",
        });
      }
    }

    const updatedNotes = notes || rejection_reason ? `${visitor.notes || ""}\n${notes || rejection_reason || ""}`.trim() : visitor.notes;

    const updateQuery = `
      UPDATE visitors
      SET status = $1, notes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, [newStatus, updatedNotes, visitor.id]);

    return res.status(200).json({
      success: true,
      message: `Visitor request for '${visitor.visitor_id}' has been ${newStatus.toLowerCase()} successfully.`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error updating visitor status:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating visitor status.",
      error: error.message,
    });
  }
};

/**
 * Approve Visitor Helper
 */
export const approveVisitor = async (req, res) => {
  req.body = req.body || {};
  req.body.status = "APPROVED";
  return updateVisitorStatus(req, res);
};

/**
 * Reject Visitor Helper
 */
export const rejectVisitor = async (req, res) => {
  req.body = req.body || {};
  req.body.status = "REJECTED";
  return updateVisitorStatus(req, res);
};

/**
 * Get All Visitors (Admin views all, Reception views all, Employee views assigned)
 */
export const getVisitors = async (req, res) => {
  try {
    const { search, status, hostEmployeeId } = req.query;
    const { role, employee_id } = req.user;

    let conditions = [];
    let values = [];
    let paramIdx = 1;

    // Scope for Employee role
    if (role === "employee") {
      conditions.push(`host_employee_id = $${paramIdx++}`);
      values.push(employee_id);
    } else if (hostEmployeeId) {
      conditions.push(`host_employee_id = $${paramIdx++}`);
      values.push(hostEmployeeId);
    }

    // Status filter
    if (status) {
      conditions.push(`UPPER(status) = $${paramIdx++}`);
      values.push(status.toUpperCase());
    }

    // Search query
    if (search) {
      conditions.push(
        `(full_name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR mobile ILIKE $${paramIdx} OR visitor_id ILIKE $${paramIdx} OR office_name ILIKE $${paramIdx})`
      );
      values.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT * FROM visitors
      ${whereClause}
      ORDER BY id DESC;
    `;

    const { rows } = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: "Visitors fetched successfully.",
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("❌ Error fetching visitors:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching visitors.",
      error: error.message,
    });
  }
};

/**
 * Get Visitor By ID
 */
export const getVisitorById = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, employee_id } = req.user;

    const isNumeric = /^\d+$/.test(id);
    const query = isNumeric
      ? "SELECT * FROM visitors WHERE id = $1"
      : "SELECT * FROM visitors WHERE visitor_id = $1";

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Visitor not found with ID '${id}'.`,
      });
    }

    const visitor = rows[0];

    if (role === "employee" && visitor.host_employee_id !== employee_id) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You can only view visitors assigned to you.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Visitor details retrieved successfully.",
      data: visitor,
    });
  } catch (error) {
    console.error("❌ Error fetching visitor by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching visitor details.",
      error: error.message,
    });
  }
};
