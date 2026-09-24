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

    const vVisitDate = String(
      req.body.visitDate ||
      req.body.visit_date ||
      req.body.expectedDate ||
      req.body.expected_date ||
      req.body.date ||
      new Date().toISOString().split("T")[0]
    ).trim();

    const insertQuery = `
      INSERT INTO visitors (
        visitor_id, photo, full_name, email, mobile, office_name,
        host_employee_id, host_employee_name, host_department,
        purpose, visitor_type, visit_date, notes, status, receptionist_id, receptionist_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PENDING', $14, $15)
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
      vVisitDate,
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

        let tokensToSend = [];
        if (userRes.rows.length > 0) {
          userRes.rows.forEach(r => {
            if (r.fcm_token && r.fcm_token.trim()) tokensToSend.push(r.fcm_token.trim());
          });
        }

        // Fallback: If no specific token found for target host, notify all active tokens so notification is not silently lost
        if (tokensToSend.length === 0) {
          console.warn(`⚠️ No specific fcm_token found in DB for host '${vHostEmpId}'. Fetching all active tokens as fallback...`);
          const fallbackRes = await pool.query(
            "SELECT fcm_token FROM users WHERE fcm_token IS NOT NULL AND TRIM(fcm_token) != ''"
          );
          fallbackRes.rows.forEach(r => {
            if (r.fcm_token && r.fcm_token.trim()) tokensToSend.push(r.fcm_token.trim());
          });
        }

        const uniqueTokens = [...new Set(tokensToSend)];
        console.log(`📱 Found ${uniqueTokens.length} FCM token(s) to notify for visitor arrival.`);

        for (const token of uniqueTokens) {
          await sendVisitorArrivalNotification(token, createdVisitor);
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
 * Pre-Register Visitor (Employee / Admin / Reception)
 * Allows employee to pre-register visitors themselves.
 * Status defaults to 'APPROVED' as it is pre-registered by the employee host.
 * receptionist_id and receptionist_name remain NULL for pre-registration.
 * visitDate is mandatory.
 */
export const preRegisterVisitor = async (req, res) => {
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
      visitDate,
      visit_date,
      expectedDate,
      expected_date,
      notes,
    } = req.body;

    const vFullName = String(fullName || full_name || req.body?.name || "").trim();
    const vMobile = String(mobile || req.body?.phone || "").trim();
    const vEmail = String(email || "").trim();
    const vOfficeName = String(officeName || office_name || req.body?.company || "").trim();
    const vPurpose = String(purpose || "").trim();
    const vVisitorType = String(visitorType || visitor_type || "PRE_REGISTERED").trim();
    const vVisitDate = String(visitDate || visit_date || expectedDate || expected_date || req.body?.date || "").trim();
    const vNotes = String(notes || "").trim();

    if (!vFullName || !vMobile || !vVisitDate) {
      return res.status(400).json({
        success: false,
        message: "fullName, mobile, and visitDate (visit_date) are required fields for pre-registration.",
      });
    }

    // Identify target host employee
    const userEmpId = req.user?.employee_id || req.user?.username || String(req.user?.id || "");
    const targetHostId = String(hostEmployeeId || host_employee_id || userEmpId).trim();

    let finalHostEmpId = targetHostId;
    let finalHostName = String(hostEmployeeName || host_employee_name || req.user?.full_name || req.user?.name || "").trim();
    let finalHostDept = String(hostDepartment || host_department || "").trim();

    // Fetch employee details from DB if available
    const empRes = await pool.query(
      "SELECT employee_id, full_name, department FROM employees WHERE employee_id = $1 OR id::text = $1 OR employee_id IN (SELECT employee_id FROM users WHERE username = $1 OR id::text = $1)",
      [targetHostId]
    );

    if (empRes.rows.length > 0) {
      if (empRes.rows[0].employee_id) finalHostEmpId = empRes.rows[0].employee_id;
      if (!finalHostName || finalHostName === "undefined") finalHostName = empRes.rows[0].full_name;
      if (!finalHostDept) finalHostDept = empRes.rows[0].department;
    }

    if (!finalHostName || finalHostName === "undefined") {
      finalHostName = req.user?.full_name || req.user?.username || "Employee";
    }

    // Auto Visitor ID (e.g. VIS1001)
    const visitorId = await generateAutoVisitorId();

    // Save Base64 photo if provided
    let photoPath = null;
    if (photo) {
      photoPath = saveBase64Image(photo, "visitors");
    }

    const vVisitTime = String(req.body.visitTime || req.body.visit_time || req.body.time || "").trim();
    let vPassCode = String(req.body.passCode || req.body.pass_code || "").trim();
    if (!vPassCode) {
      const numPart = visitorId.replace(/\D/g, "");
      vPassCode = `PR-${numPart || Math.floor(1000 + Math.random() * 9000)}`;
    }

    const insertQuery = `
      INSERT INTO visitors (
        visitor_id, photo, full_name, email, mobile, office_name,
        host_employee_id, host_employee_name, host_department,
        purpose, visitor_type, visit_date, visit_time, pass_code, notes, status, receptionist_id, receptionist_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'APPROVED', NULL, NULL)
      RETURNING *;
    `;

    let rows;
    try {
      const result = await pool.query(insertQuery, [
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
        vVisitDate,
        vVisitTime,
        vPassCode,
        vNotes,
      ]);
      rows = result.rows;
    } catch (dbErr) {
      if (
        dbErr.message &&
        (dbErr.message.includes("pass_code") || dbErr.message.includes("visit_time"))
      ) {
        await pool.query(`
          ALTER TABLE visitors 
          ADD COLUMN IF NOT EXISTS pass_code VARCHAR(50),
          ADD COLUMN IF NOT EXISTS visit_time VARCHAR(50);
        `);
        const result = await pool.query(insertQuery, [
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
          vVisitDate,
          vVisitTime,
          vPassCode,
          vNotes,
        ]);
        rows = result.rows;
      } else {
        throw dbErr;
      }
    }

    const createdVisitor = rows[0];

    return res.status(201).json({
      success: true,
      message: "Visitor pre-registered and approved successfully.",
      data: createdVisitor,
    });
  } catch (error) {
    console.error("❌ Error pre-registering visitor:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while pre-registering visitor.",
      error: error.message,
    });
  }
};

/**
 * Search Pre-Registered Visitor
 * Endpoint: GET /api/visitors/pre-register/search/:query
 * Optional alias: GET /api/visitors/pre-register/:id
 * Searches pre-registered visitor by ObjectId/id, visitorId, passCode, mobile number, or fullName.
 */
export const searchPreRegisteredVisitor = async (req, res) => {
  try {
    const rawQuery = req.params?.query ?? req.params?.id ?? req.query?.query ?? req.query?.q ?? "";
    const trimmedQuery = String(rawQuery).trim();

    if (!trimmedQuery) {
      return res.status(400).json({
        success: false,
        message: "Search query parameter is required.",
      });
    }

    // Clean variants for matching
    const cleanPhone = trimmedQuery.replace(/\D/g, "");
    const codeNumber = trimmedQuery.replace(/^PR-?/i, "").trim();

    // Query pre-registered visitor matching query
    // Pre-registered condition: visitor_type matches /pre-register/i or status matches /pre-approved/i
    const sql = `
      SELECT * FROM visitors
      WHERE (
        -- 1. Numeric ID match
        (CASE WHEN $1 ~ '^\\d{1,9}$' THEN id = $1::integer ELSE false END)
        -- 2. visitor_id match (exact or case-insensitive)
        OR UPPER(visitor_id) = UPPER($1)
        OR visitor_id ILIKE $1
        -- 3. pass_code match (exact or case-insensitive)
        OR (pass_code IS NOT NULL AND (UPPER(pass_code) = UPPER($1) OR pass_code ILIKE $1))
        -- 4. mobile match
        OR mobile ILIKE '%' || $1 || '%'
        OR (CASE WHEN $2 != '' AND LENGTH($2) >= 4 THEN REPLACE(REPLACE(REPLACE(mobile, '+', ''), '-', ''), ' ', '') ILIKE '%' || $2 || '%' ELSE false END)
        -- 5. full_name match
        OR full_name ILIKE '%' || $1 || '%'
        -- 6. Pass code number or VIS number match
        OR (CASE WHEN $3 != '' THEN (
              (pass_code IS NOT NULL AND pass_code ILIKE '%' || $3 || '%')
              OR visitor_id ILIKE '%' || $3 || '%'
              OR (CASE WHEN $3 ~ '^\\d{1,9}$' THEN id = $3::integer ELSE false END)
           ) ELSE false END)
      )
      AND (
        visitor_type ILIKE '%pre%register%'
        OR visitor_type ILIKE '%preregister%'
        OR status ILIKE '%pre%approved%'
        OR status ILIKE '%pre_approved%'
        OR (visitor_type IS NOT NULL AND visitor_type ILIKE '%pre%')
      )
      ORDER BY 
        CASE 
          WHEN UPPER(status) IN ('APPROVED', 'PENDING', 'PRE-APPROVED', 'PRE_APPROVED') THEN 1 
          WHEN UPPER(status) = 'CHECKED_IN' THEN 2 
          ELSE 3 
        END, 
        id DESC
      LIMIT 1;
    `;

    let rows;
    try {
      const result = await pool.query(sql, [trimmedQuery, cleanPhone, codeNumber]);
      rows = result.rows;
    } catch (dbErr) {
      if (
        dbErr.message &&
        (dbErr.message.includes("pass_code") || dbErr.message.includes("visit_time"))
      ) {
        await pool.query(`
          ALTER TABLE visitors 
          ADD COLUMN IF NOT EXISTS pass_code VARCHAR(50),
          ADD COLUMN IF NOT EXISTS visit_time VARCHAR(50);
        `);
        const retryResult = await pool.query(sql, [trimmedQuery, cleanPhone, codeNumber]);
        rows = retryResult.rows;
      } else {
        throw dbErr;
      }
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No pre-registered visitor found with this ID or Code",
      });
    }

    const visitor = rows[0];

    const passCode =
      visitor.pass_code ||
      (visitor.visitor_id
        ? `PR-${visitor.visitor_id.replace(/\D/g, "") || visitor.id}`
        : `PR-${visitor.id}`);

    const formattedData = {
      _id: String(visitor.id),
      id: visitor.id,
      visitorId: visitor.visitor_id,
      visitor_id: visitor.visitor_id,
      fullName: visitor.full_name,
      full_name: visitor.full_name,
      email: visitor.email,
      mobile: visitor.mobile,
      officeName: visitor.office_name,
      office_name: visitor.office_name,
      purpose: visitor.purpose,
      visitorType: visitor.visitor_type,
      visitor_type: visitor.visitor_type,
      status: visitor.status,
      passCode: passCode,
      pass_code: passCode,
      visitDate: visitor.visit_date,
      visit_date: visitor.visit_date,
      visitTime: visitor.visit_time || null,
      visit_time: visitor.visit_time || null,
      hostEmployeeId: visitor.host_employee_id,
      host_employee_id: visitor.host_employee_id,
      hostEmployeeName: visitor.host_employee_name,
      host_employee_name: visitor.host_employee_name,
      hostDepartment: visitor.host_department,
      host_department: visitor.host_department,
      photo: visitor.photo || null,
      notes: visitor.notes || null,
      receptionistId: visitor.receptionist_id || null,
      receptionist_id: visitor.receptionist_id || null,
      receptionistName: visitor.receptionist_name || null,
      receptionist_name: visitor.receptionist_name || null,
      checkInTime: visitor.check_in_time || null,
      check_in_time: visitor.check_in_time || null,
      checkOutTime: visitor.check_out_time || null,
      check_out_time: visitor.check_out_time || null,
      createdAt: visitor.created_at,
      created_at: visitor.created_at,
      updatedAt: visitor.updated_at,
      updated_at: visitor.updated_at,
    };

    return res.status(200).json({
      success: true,
      message: "Pre-registered visitor found successfully",
      data: formattedData,
    });
  } catch (error) {
    console.error("❌ Error searching pre-registered visitor:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while searching pre-registered visitor.",
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

    if (!status || !["APPROVED", "REJECTED", "PENDING"].includes(status.toUpperCase())) {
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
 * Check-In Visitor Endpoint
 * Route: POST /api/visitors/:id/check-in (or POST /api/visitors/check-in)
 * Rule: Allowed ONLY if visitor status is APPROVED or visitor is PRE_REGISTERED.
 */
export const checkInVisitor = async (req, res) => {
  try {
    const targetId =
      req.params?.id ||
      req.params?.visitorId ||
      req.body?.visitor_id ||
      req.body?.visitorId ||
      req.body?.id;

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: "visitor_id or id is required for check-in.",
      });
    }

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

    // Check if already checked in
    if (visitor.status === "CHECKED_IN") {
      return res.status(400).json({
        success: false,
        message: `Visitor '${visitor.visitor_id}' is already checked in.`,
      });
    }

    // Check if already checked out
    if (visitor.status === "CHECKED_OUT") {
      return res.status(400).json({
        success: false,
        message: `Visitor '${visitor.visitor_id}' has already checked out. Cannot check in again.`,
      });
    }

    // Check if rejected
    if (visitor.status === "REJECTED") {
      return res.status(400).json({
        success: false,
        message: `Cannot check in visitor '${visitor.visitor_id}'. Visitor request was rejected.`,
      });
    }

    // Condition: Must be APPROVED or PRE_REGISTERED
    const isApproved = String(visitor.status || "").toUpperCase() === "APPROVED";
    const isPreRegistered =
      String(visitor.visitor_type || "").toUpperCase() === "PRE_REGISTERED" ||
      String(visitor.status || "").toUpperCase().includes("PRE_APPROVED");

    if (!isApproved && !isPreRegistered) {
      return res.status(400).json({
        success: false,
        message: `Cannot check in visitor '${visitor.visitor_id}'. Visitor must be approved or pre-registered first. Current status: ${visitor.status}.`,
      });
    }

    const notes = req.body?.notes;
    const updatedNotes = notes ? `${visitor.notes || ""}\n${notes}`.trim() : visitor.notes;

    const updateQuery = `
      UPDATE visitors
      SET status = 'CHECKED_IN', notes = $1, check_in_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;

    let result;
    try {
      result = await pool.query(updateQuery, [updatedNotes, visitor.id]);
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes("check_in_time")) {
        await pool.query(`
          ALTER TABLE visitors 
          ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP,
          ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP;
        `);
        result = await pool.query(updateQuery, [updatedNotes, visitor.id]);
      } else {
        throw dbErr;
      }
    }

    const updatedVisitor = result.rows[0];

    // Trigger FCM Notification (Non-blocking background process)
    (async () => {
      try {
        if (visitor.receptionist_id) {
          const recepRes = await pool.query(
            "SELECT fcm_token FROM users WHERE (employee_id = $1 OR username = $1) AND fcm_token IS NOT NULL AND TRIM(fcm_token) != ''",
            [visitor.receptionist_id]
          );
          if (recepRes.rows.length > 0 && recepRes.rows[0].fcm_token) {
            await sendVisitorStatusNotification(recepRes.rows[0].fcm_token, updatedVisitor, "CHECKED_IN");
          }
        }
      } catch (fcmErr) {
        console.error("⚠️ Background FCM check-in notification error:", fcmErr.message);
      }
    })();

    return res.status(200).json({
      success: true,
      message: `Visitor '${visitor.visitor_id}' checked in successfully.`,
      data: updatedVisitor,
    });
  } catch (error) {
    console.error("❌ Error checking in visitor:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while checking in visitor.",
      error: error.message,
    });
  }
};

/**
 * Check-Out Visitor Endpoint
 * Route: POST /api/visitors/:id/check-out (or POST /api/visitors/check-out)
 * Rule: Allowed ONLY if visitor status is CHECKED_IN.
 */
export const checkOutVisitor = async (req, res) => {
  try {
    const targetId =
      req.params?.id ||
      req.params?.visitorId ||
      req.body?.visitor_id ||
      req.body?.visitorId ||
      req.body?.id;

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: "visitor_id or id is required for check-out.",
      });
    }

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

    // Check if already checked out
    if (visitor.status === "CHECKED_OUT") {
      return res.status(400).json({
        success: false,
        message: `Visitor '${visitor.visitor_id}' is already checked out.`,
      });
    }

    // Condition: Must currently be CHECKED_IN
    if (String(visitor.status || "").toUpperCase() !== "CHECKED_IN") {
      return res.status(400).json({
        success: false,
        message: `Cannot check out visitor '${visitor.visitor_id}'. Visitor must be checked in first. Current status: ${visitor.status}.`,
      });
    }

    const notes = req.body?.notes;
    const updatedNotes = notes ? `${visitor.notes || ""}\n${notes}`.trim() : visitor.notes;

    const updateQuery = `
      UPDATE visitors
      SET status = 'CHECKED_OUT', notes = $1, check_out_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;

    let result;
    try {
      result = await pool.query(updateQuery, [updatedNotes, visitor.id]);
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes("check_out_time")) {
        await pool.query(`
          ALTER TABLE visitors 
          ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP,
          ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP;
        `);
        result = await pool.query(updateQuery, [updatedNotes, visitor.id]);
      } else {
        throw dbErr;
      }
    }

    const updatedVisitor = result.rows[0];

    // Trigger FCM Notification (Non-blocking background process)
    (async () => {
      try {
        if (visitor.receptionist_id) {
          const recepRes = await pool.query(
            "SELECT fcm_token FROM users WHERE (employee_id = $1 OR username = $1) AND fcm_token IS NOT NULL AND TRIM(fcm_token) != ''",
            [visitor.receptionist_id]
          );
          if (recepRes.rows.length > 0 && recepRes.rows[0].fcm_token) {
            await sendVisitorStatusNotification(recepRes.rows[0].fcm_token, updatedVisitor, "CHECKED_OUT");
          }
        }
      } catch (fcmErr) {
        console.error("⚠️ Background FCM check-out notification error:", fcmErr.message);
      }
    })();

    return res.status(200).json({
      success: true,
      message: `Visitor '${visitor.visitor_id}' checked out successfully.`,
      data: updatedVisitor,
    });
  } catch (error) {
    console.error("❌ Error checking out visitor:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while checking out visitor.",
      error: error.message,
    });
  }
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
