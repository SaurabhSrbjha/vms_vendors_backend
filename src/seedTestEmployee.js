import pool from "./config/db.js";
import { syncAllModels } from "./models/index.js";
import { hashPassword } from "./utils.js";

async function seedData() {
  try {
    console.log("Syncing models...");
    await syncAllModels();

    // 1. Seed Admin
    const adminCheck = await pool.query("SELECT id, username FROM users WHERE username = $1", ["admin"]);
    if (adminCheck.rows.length === 0) {
      const hashedAdminPass = await hashPassword("admin123");
      const adminRes = await pool.query(
        "INSERT INTO users (username, password, role, status) VALUES ($1, $2, $3, $4) RETURNING id, username, role, status",
        ["admin", hashedAdminPass, "admin", "active"]
      );
      console.log("✅ Admin User Created:", adminRes.rows[0]);
    } else {
      console.log("ℹ️ Admin user exists:", adminCheck.rows[0]);
    }

    // 2. Seed Employee 1 (EMP1001)
    const empCheck = await pool.query("SELECT * FROM employees WHERE employee_id = $1", ["EMP1001"]);
    if (empCheck.rows.length === 0) {
      const empRes = await pool.query(
        `INSERT INTO employees (employee_id, full_name, dob, mobile, email, department, designation, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        ["EMP1001", "Rahul Sharma", "1995-05-15", "+919876543210", "rahul@example.com", "Engineering", "Software Developer", "employee", "active"]
      );
      console.log("✅ Employee Created:", empRes.rows[0]);
    } else {
      console.log("ℹ️ Employee EMP1001 exists:", empCheck.rows[0]);
    }

    const userCheck = await pool.query("SELECT id, username, role, status FROM users WHERE username = $1", ["EMP1001"]);
    if (userCheck.rows.length === 0) {
      const hashedPassword = await hashPassword("1995-05-15");
      const userRes = await pool.query(
        "INSERT INTO users (employee_id, username, password, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, status",
        ["EMP1001", "EMP1001", hashedPassword, "employee", "active"]
      );
      console.log("✅ Employee User Account Created:", userRes.rows[0]);
    } else {
      console.log("ℹ️ User EMP1001 exists:", userCheck.rows[0]);
    }

    // 3. Seed Employee 2 (EMP1002 - Receptionist)
    const receptionCheck = await pool.query("SELECT * FROM employees WHERE employee_id = $1", ["EMP1002"]);
    if (receptionCheck.rows.length === 0) {
      const recEmpRes = await pool.query(
        `INSERT INTO employees (employee_id, full_name, dob, mobile, email, department, designation, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        ["EMP1002", "Priya Singh", "1998-08-20", "+919876543211", "priya@example.com", "Front Desk", "Receptionist", "reception", "active"]
      );
      console.log("✅ Reception Employee Created:", recEmpRes.rows[0]);
    } else {
      console.log("ℹ️ Employee EMP1002 exists:", receptionCheck.rows[0]);
    }

    const recUserCheck = await pool.query("SELECT id, username, role, status FROM users WHERE username = $1", ["EMP1002"]);
    if (recUserCheck.rows.length === 0) {
      const hashedRecPassword = await hashPassword("1998-08-20");
      const recUserRes = await pool.query(
        "INSERT INTO users (employee_id, username, password, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, status",
        ["EMP1002", "EMP1002", hashedRecPassword, "reception", "active"]
      );
      console.log("✅ Reception User Account Created:", recUserRes.rows[0]);
    } else {
      console.log("ℹ️ User EMP1002 exists:", recUserCheck.rows[0]);
    }

    console.log("\n--- CURRENT DB RECORDS ---");
    const allUsers = await pool.query("SELECT id, employee_id, username, role, status FROM users");
    console.log("USERS:", allUsers.rows);
    const allEmps = await pool.query("SELECT id, employee_id, full_name, dob, role, status FROM employees");
    console.log("EMPLOYEES:", allEmps.rows);

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed Error:", err);
    process.exit(1);
  }
}

seedData();
