import pool from "../config/db.js";
import { saveBase64Image, generateAutoVisitorId } from "../utils.js";
import { sendVisitorArrivalNotification, sendVisitorStatusNotification } from "../config/firebase.js";

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

    const vFullName = String(fullName || full_name || req.body?.name || "").trim();
    const vMobile = String(mobile || req.body?.phone || "").trim();
    const vHostEmpId = String(hostEmployeeId || host_employee_id || req.body?.hostEmployee?.employee_id || req.body?.hostEmployee?.id || "").trim();
    const vEmail = String(email || "").trim();
    const vOfficeName = String(officeName || office_name || req.body?.company || "").trim();
    const vPurpose = String(purpose || "").trim();
    const vVisitorType = String(visitorType || visitor_type || "").trim();
    const vNotes = String(notes || "").trim();

    if (!vFullName || !vMobile || !vHostEmpId) {
      return res.status(400).json({
        success: false,
        message: "fullName, mobile, and hostEmployeeId are required fields.",
      });
    }

    // Auto-fetch host details and real employee_id from employees table
    let finalHostEmpId = vHostEmpId;
    let finalHostName = String(hostEmployeeName || host_employee_name || req.body?.host_name || req.body?.hostEmployee?.full_name || req.body?.hostEmployee?.name || "").trim();
    let finalHostDept = String(hostDepartment || host_department || "").trim();

    const empRes = await pool.query(
      "SELECT employee_id, full_name, department FROM employees WHERE employee_id = $1 OR id::text = $1",
      [vHostEmpId]
    );
    if (empRes.rows.length > 0) {
      if (empRes.rows[0].employee_id) finalHostEmpId = empRes.rows[0].employee_id;
      if (!finalHostName) finalHostName = empRes.rows[0].full_name;
      if (!finalHostDept) finalHostDept = empRes.rows[0].department;
    }

    // Generate Auto Visitor ID (e.g. VIS1001)
    const visitorId = await generateAutoVisitorId();

    // Save Base64 Photo if provided
    let photoPath = null;
    if (photo) {
      photoPath = saveBase64Image(photo, "visitors");
    }

    // Receptionist info from logged in user token / employees table
    let receptionistId = req.user?.employee_id || req.user?.username || null;
    let receptionistName = req.user?.full_name || req.user?.name || null;

    if (!receptionistName && receptionistId) {
      const recepRes = await pool.query(
        "SELECT full_name, employee_id FROM employees WHERE employee_id = $1 OR id::text = $1 OR employee_id IN (SELECT employee_id FROM users WHERE username = $1)",
        [receptionistId]
      );
      if (recepRes.rows.length > 0) {
        receptionistName = recepRes.rows[0].full_name;
        if (recepRes.rows[0].employee_id) {
          receptionistId = recepRes.rows[0].employee_id;
        }
      }
    }
    if (!receptionistName) {
      receptionistName = req.user?.username || 'Receptionist';
    }

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
      finalHostEmpId,
      finalHostName,
      finalHostDept,
      vPurpose,
      vVisitorType,
      vNotes,
      receptionistId,
      receptionistName,
    ]);

    const createdVisitor = rows[0];

    // Trigger Firebase Notification to Host Employee (Non-blocking background process)
    (async () => {
      try {
        const userRes = await pool.query(
          "SELECT fcm_token FROM users WHERE (employee_id = $1 OR employee_id = $2 OR username = $1 OR username = $2 OR id::text = $1) AND fcm_token IS NOT NULL AND TRIM(fcm_token) != ''",
          [vHostEmpId, finalHostEmpId]
        );
        if (userRes.rows.length > 0 && userRes.rows[0].fcm_token) {
          await sendVisitorArrivalNotification(userRes.rows[0].fcm_token, createdVisitor);
        }
      } catch (fcmErr) {
        console.error("⚠️ Background FCM notification error:", fcmErr.message);
      }
    })();

    return res.status(201).json({
      success: true,
      message: "Visitor created successfully and sent for host approval.",
      data: createdVisitor,
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
      const empIdVal = req.user.employee_id || req.user.username;
      const isMatch =
        visitor.host_employee_id === empIdVal ||
        visitor.host_employee_id === String(req.user.id);

      if (!isMatch) {
        const empCheck = await pool.query(
          "SELECT id, employee_id FROM employees WHERE (employee_id = $1 OR id::text = $1) AND (employee_id = $2 OR id::text = $2)",
          [visitor.host_employee_id, empIdVal]
        );
        if (empCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: "Forbidden. You can only approve or reject visitors assigned to you.",
          });
        }
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
    const updatedVisitor = result.rows[0];

    // Trigger FCM Notification on status update (Non-blocking background process)
    (async () => {
      try {
        if (visitor.receptionist_id) {
          const recepRes = await pool.query(
            "SELECT fcm_token FROM users WHERE (employee_id = $1 OR username = $1) AND fcm_token IS NOT NULL AND TRIM(fcm_token) != ''",
            [visitor.receptionist_id]
          );
          if (recepRes.rows.length > 0 && recepRes.rows[0].fcm_token) {
            await sendVisitorStatusNotification(recepRes.rows[0].fcm_token, updatedVisitor, newStatus);
          }
        }
      } catch (fcmErr) {
        console.error("⚠️ Background FCM status notification error:", fcmErr.message);
      }
    })();

    return res.status(200).json({
      success: true,
      message: `Visitor request for '${visitor.visitor_id}' has been ${newStatus.toLowerCase()} successfully.`,
      data: updatedVisitor,
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
      const empIdVal = employee_id || req.user?.username;
      conditions.push(
        `(host_employee_id = $${paramIdx} OR host_employee_id IN (
          SELECT id::text FROM employees WHERE employee_id = $${paramIdx} OR id::text = $${paramIdx}
        ) OR host_employee_id IN (
          SELECT employee_id FROM employees WHERE id::text = $${paramIdx} OR employee_id = $${paramIdx}
        ))`
      );
      values.push(empIdVal);
      paramIdx++;
    } else if (hostEmployeeId) {
      conditions.push(
        `(host_employee_id = $${paramIdx} OR host_employee_id IN (
          SELECT id::text FROM employees WHERE employee_id = $${paramIdx} OR id::text = $${paramIdx}
        ) OR host_employee_id IN (
          SELECT employee_id FROM employees WHERE id::text = $${paramIdx} OR employee_id = $${paramIdx}
        ))`
      );
      values.push(hostEmployeeId);
      paramIdx++;
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

    if (role === "employee") {
      const empIdVal = employee_id || req.user?.username;
      const isMatch =
        visitor.host_employee_id === empIdVal ||
        visitor.host_employee_id === String(req.user.id);

      if (!isMatch) {
        const empCheck = await pool.query(
          "SELECT id, employee_id FROM employees WHERE (employee_id = $1 OR id::text = $1) AND (employee_id = $2 OR id::text = $2)",
          [visitor.host_employee_id, empIdVal]
        );
        if (empCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: "Forbidden. You can only view visitors assigned to you.",
          });
        }
      }
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
