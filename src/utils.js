import pool from "./config/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
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
 * Format DOB string to DDMMYYYY format
 * Supports formats like '14-09-1998', '1998-09-14', '14/09/1998', '1998/09/14'
 */
export const formatDobDDMMYYYY = (dobStr) => {
  if (!dobStr) return "";
  const str = String(dobStr).trim();

  // Match YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const [, yyyy, mm, dd] = ymdMatch;
    return `${dd.padStart(2, "0")}${mm.padStart(2, "0")}${yyyy}`;
  }

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    return `${dd.padStart(2, "0")}${mm.padStart(2, "0")}${yyyy}`;
  }

  // Fallback: strip non-digits
  const digits = str.replace(/\D/g, "");
  if (digits.length === 8) {
    // If starts with YYYY
    if (parseInt(digits.slice(0, 4), 10) > 1900) {
      const yyyy = digits.slice(0, 4);
      const mm = digits.slice(4, 6);
      const dd = digits.slice(6, 8);
      return `${dd}${mm}${yyyy}`;
    }
    return digits;
  }

  return digits;
};

/**
 * Extract last 6 digits from mobile number
 */
export const getLast6DigitsOfPhone = (phoneStr) => {
  if (!phoneStr) return "";
  const digits = String(phoneStr).replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-6) : digits;
};

/**
 * Generate Employee Username: Employee ID + Last 6 digits of mobile
 * e.g. EMP1001 + 332955 => EMP1001332955
 */
export const generateEmployeeUsername = (empId, mobile) => {
  const last6 = getLast6DigitsOfPhone(mobile);
  return `${empId}${last6}`;
};

/**
 * Generate Employee Default Password: Employee ID + DDMMYYYY of DOB
 * e.g. EMP1001 + 14091998 (for DOB 14-09-1998) => EMP100114091998
 */
export const generateEmployeeDefaultPassword = (empId, dob) => {
  const formattedDob = formatDobDDMMYYYY(dob);
  return `${empId}${formattedDob}`;
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
 * Save Base64 image string into uploads folder
 */
export const saveBase64Image = (base64Data, subFolder = "visitors") => {
  if (!base64Data || typeof base64Data !== "string") return null;

  // If it's already an HTTP/HTTPS URL or relative path, return as is
  if (
    base64Data.startsWith("http://") ||
    base64Data.startsWith("https://") ||
    base64Data.startsWith("/uploads/")
  ) {
    return base64Data;
  }

  let ext = "jpg";
  let cleanBase64 = base64Data;

  // Check for Data URI scheme e.g. data:image/png;base64,iVBOR...
  const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+\-+]+);base64,(.+)$/);
  if (matches) {
    ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    cleanBase64 = matches[2];
  }

  const uploadDir = path.join(process.cwd(), "uploads", subFolder);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `visitor_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}.${ext}`;
  const filePath = path.join(uploadDir, filename);

  const buffer = Buffer.from(cleanBase64, "base64");
  fs.writeFileSync(filePath, buffer);

  return `/uploads/${subFolder}/${filename}`;
};

/**
 * Auto-generate Visitor ID e.g. VIS1001
 */
export const generateAutoVisitorId = async () => {
  try {
    const { rows } = await pool.query(
      "SELECT visitor_id FROM visitors WHERE visitor_id LIKE 'VIS%' ORDER BY id DESC LIMIT 1"
    );

    if (rows.length === 0) {
      return "VIS1001";
    }

    const lastIdStr = rows[0].visitor_id;
    const numberMatch = lastIdStr.match(/\d+/);
    if (numberMatch) {
      const nextNum = parseInt(numberMatch[0], 10) + 1;
      return `VIS${nextNum}`;
    }

    return `VIS${Date.now().toString().slice(-4)}`;
  } catch (err) {
    return `VIS${Math.floor(1000 + Math.random() * 9000)}`;
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