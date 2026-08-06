import pool from "../config/db.js";
import {
  hashPassword,
  generateAutoEmployeeId,
  generateEmployeeUsername,
  generateEmployeeDefaultPassword,
} from "../utils.js";

/**
 * GET /api/employees
 * Fetch list of all employees (Admin only)
 */
export const getEmployees = async (req, res) => {
  try {
    const { search, role, status } = req.query;

    let query = "SELECT * FROM employees WHERE 1=1";
    const values = [];
    let valIndex = 1;

    if (search) {
      query += ` AND (full_name ILIKE $${valIndex} OR employee_id ILIKE $${valIndex} OR email ILIKE $${valIndex} OR department ILIKE $${valIndex})`;
      values.push(`%${search}%`);
      valIndex++;
    }

    if (role) {
      query += ` AND role = $${valIndex}`;
      values.push(role.toLowerCase());
      valIndex++;
    }

    if (status) {
      query += ` AND status = $${valIndex}`;
      values.push(status.toLowerCase());
      valIndex++;
    }

    query += " ORDER BY id DESC";

    const { rows } = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: "Employees fetched successfully",
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error in getEmployees:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching employees.",
    });
  }
};

/**
 * GET /api/employees/:id
 * Get single employee details
 */
export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      "SELECT * FROM employees WHERE id = $1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Error in getEmployeeById:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

/**
 * POST /api/employees
 * Add Employee (Admin only)
 * Automatically creates corresponding user record in `users` table
 */
export const createEmployee = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      full_name,
      employee_id,
      dob,
      mobile,
      email,
      department,
      designation,
      role,
      status = "active",
    } = req.body;

    if (!full_name || !dob || !mobile || !email || !department || !designation || !role) {
      return res.status(400).json({
        success: false,
        message: "Full Name, Date of Birth, Mobile, Email, Department, Designation, and Role are required.",
      });
    }

    const formattedRole = role.toLowerCase();
    if (!["employee", "reception"].includes(formattedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role must be either 'employee' or 'reception'.",
      });
    }

    const formattedStatus = (status || "active").toLowerCase();

    // Auto-generate employee_id if not provided
    let finalEmployeeId = employee_id ? employee_id.trim() : null;
    if (!finalEmployeeId) {
      finalEmployeeId = await generateAutoEmployeeId();
    }

    // Generate Username (emp_id + last 6 digits of mobile) e.g. EMP1001332955
    const finalUsername = generateEmployeeUsername(finalEmployeeId, mobile.trim());

    // Generate Default Password (emp_id + DDMMYYYY of DOB) e.g. EMP100114091998
    const defaultPassword = generateEmployeeDefaultPassword(finalEmployeeId, dob.trim());

    // Check existing employee_id or username
    const existingEmp = await pool.query(
      "SELECT id FROM employees WHERE employee_id = $1",
      [finalEmployeeId]
    );
    if (existingEmp.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Employee with ID '${finalEmployeeId}' already exists.`,
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [finalUsername]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `User with username '${finalUsername}' already exists.`,
      });
    }

    await client.query("BEGIN");

    // 1. Create employee record
    const insertEmpQuery = `
      INSERT INTO employees (employee_id, full_name, dob, mobile, email, department, designation, role, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const empResult = await client.query(insertEmpQuery, [
      finalEmployeeId,
      full_name.trim(),
      dob.trim(),
      mobile.trim(),
      email.trim(),
      department.trim(),
      designation.trim(),
      formattedRole,
      formattedStatus,
    ]);

    const createdEmployee = empResult.rows[0];

    // 2. Create user record automatically
    // Username: Employee ID + last 6 digits of mobile (e.g. EMP1001332955)
    // Password: Employee ID + DDMMYYYY of DOB (Hashed before storing, e.g. EMP100114091998)
    // Role: employee or reception
    // Status: active
    const hashedPassword = await hashPassword(defaultPassword);

    const insertUserQuery = `
      INSERT INTO users (employee_id, username, password, role, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, role, status;
    `;

    await client.query(insertUserQuery, [
      finalEmployeeId,
      finalUsername,
      hashedPassword,
      formattedRole,
      formattedStatus,
    ]);

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Employee created successfully and user account generated.",
      data: createdEmployee,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in createEmployee:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create employee.",
    });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/employees/:id
 * Edit Employee (Admin only)
 */
export const updateEmployee = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      full_name,
      dob,
      mobile,
      email,
      department,
      designation,
      role,
      status,
    } = req.body;

    const findEmp = await client.query(
      "SELECT * FROM employees WHERE id = $1",
      [id]
    );

    if (findEmp.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const currentEmp = findEmp.rows[0];
    const formattedRole = role ? role.toLowerCase() : currentEmp.role;
    const formattedStatus = status ? status.toLowerCase() : currentEmp.status;

    await client.query("BEGIN");

    const updateEmpQuery = `
      UPDATE employees
      SET full_name = COALESCE($1, full_name),
          dob = COALESCE($2, dob),
          mobile = COALESCE($3, mobile),
          email = COALESCE($4, email),
          department = COALESCE($5, department),
          designation = COALESCE($6, designation),
          role = COALESCE($7, role),
          status = COALESCE($8, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *;
    `;

    const empRes = await client.query(updateEmpQuery, [
      full_name ? full_name.trim() : null,
      dob ? dob.trim() : null,
      mobile ? mobile.trim() : null,
      email ? email.trim() : null,
      department ? department.trim() : null,
      designation ? designation.trim() : null,
      formattedRole,
      formattedStatus,
      id,
    ]);

    // Update corresponding user record role and status
    await client.query(
      "UPDATE users SET role = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $3",
      [formattedRole, formattedStatus, currentEmp.employee_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Employee updated successfully.",
      data: empRes.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in updateEmployee:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update employee.",
    });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/employees/:id/status
 * Activate / Deactivate Employee
 */
export const toggleEmployeeStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["active", "inactive"].includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'active' or 'inactive'.",
      });
    }

    const newStatus = status.toLowerCase();

    const findEmp = await client.query(
      "SELECT * FROM employees WHERE id = $1",
      [id]
    );

    if (findEmp.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const emp = findEmp.rows[0];

    await client.query("BEGIN");

    // Update employees table
    const empRes = await client.query(
      "UPDATE employees SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [newStatus, id]
    );

    // Update users table
    await client.query(
      "UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2",
      [newStatus, emp.employee_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: `Employee status changed to '${newStatus}'.`,
      data: empRes.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in toggleEmployeeStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update status.",
    });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/employees/:id
 * Delete Employee (Admin only)
 * Removes employee record from `employees` table and corresponding user from `users` table.
 */
export const deleteEmployee = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const findEmp = await client.query(
      "SELECT * FROM employees WHERE id = $1",
      [id]
    );

    if (findEmp.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const emp = findEmp.rows[0];

    await client.query("BEGIN");

    // 1. Delete record from employees table
    const deleteEmpResult = await client.query(
      "DELETE FROM employees WHERE id = $1 RETURNING *",
      [id]
    );

    // 2. Delete corresponding user record from users table
    if (emp.employee_id) {
      await client.query(
        "DELETE FROM users WHERE employee_id = $1",
        [emp.employee_id]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Employee and associated user account deleted successfully.",
      data: deleteEmpResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in deleteEmployee:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete employee.",
    });
  } finally {
    client.release();
  }
};

