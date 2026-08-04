import pool from "./config/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare plain text password with hashed password
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT token containing user info & role
 */
export const generateToken = (user) => {
  const payload = {
    id: user.id,
    employee_id: user.employee_id || null,
    username: user.username,
    role: user.role,
  };

  const secret = process.env.JWT_SECRET || "default_jwt_secret";
  return jwt.sign(payload, secret, {
    expiresIn: "1d",
  });
};

/**
 * JWT Verification Middleware
 */
export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const secret = process.env.JWT_SECRET || "default_jwt_secret";
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token.",
        });
      }
      req.user = decoded;
      next();
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Authentication error.",
    });
  }
};

/**
 * Role-Based Access Control (RBAC) Middleware
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User context missing.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' does not have access to this resource.`,
      });
    }

    next();
  };
};

/**
 * Helper to auto-generate Employee ID if not provided (e.g. EMP1001)
 */
export const generateAutoEmployeeId = async () => {
  try {
    const { rows } = await pool.query(
      "SELECT employee_id FROM employees WHERE employee_id LIKE 'EMP%' ORDER BY id DESC LIMIT 1"
    );

    if (rows.length === 0) {
      return "EMP1001";
    }

    const lastIdStr = rows[0].employee_id;
    const numberMatch = lastIdStr.match(/\d+/);
    if (numberMatch) {
      const nextNum = parseInt(numberMatch[0], 10) + 1;
      return `EMP${nextNum}`;
    }

    return `EMP${Date.now().toString().slice(-4)}`;
  } catch (err) {
    return `EMP${Math.floor(1000 + Math.random() * 9000)}`;
  }
};

/**
 * Table Sync helper
 */
export const baseTableModel = async (tableName, columns) => {
  try {
    const normalized = {};
    for (let key in columns) {
      normalized[key.toLowerCase()] = columns[key];
    }
    const columnDefs = Object.entries(normalized)
      .map(([key, type]) => `${key} ${type}`)
      .join(", ");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${columnDefs}
      );
    `);
    const { rows } = await pool.query(`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_name='${tableName}';
    `);

    const existing = rows.map((r) => r.column_name.toLowerCase());

    for (const [colName, colType] of Object.entries(normalized)) {
      if (!existing.includes(colName)) {
        console.log(`➕ Adding missing column: ${colName}`);
        await pool.query(`
          ALTER TABLE ${tableName}
          ADD COLUMN ${colName} ${colType};
        `);
      }
    }

    console.log(`✅ Table '${tableName}' synced successfully`);
  } catch (err) {
    console.error(`❌ Error syncing table '${tableName}':`, err);
    throw err;
  }
};