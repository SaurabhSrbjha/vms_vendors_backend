import pool from "../config/db.js";
import { comparePassword, generateToken } from "../utils.js";

/**
 * POST /api/login
 * Single common Login API for Admin, Employee, Reception
 */
export const login = async (req, res) => {
  try {
    const { username, password, device_type, fcm_token, fcmToken } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    if (!device_type || !["web", "mobile"].includes(device_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing device_type. Must be 'web' or 'mobile'.",
      });
    }

    // 1. Find user from users table using username
    const { rows } = await pool.query(
      "SELECT id, employee_id, username, password, role, status FROM users WHERE username = $1",
      [username.trim()],
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    const user = rows[0];

    // 2. Verify hashed password
    let isPasswordValid = false;
    try {
      isPasswordValid = await comparePassword(password, user.password);
    } catch (e) {
      isPasswordValid = false;
    }

    // Fallback check if stored password happened to be plain text during initial seeder
    if (!isPasswordValid && user.password === password) {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    // 3. Check user status
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message:
          "User account is inactive. Please contact system administrator.",
      });
    }

    // 4 & 5. Validate device_type against user role
    const role = user.role.toLowerCase();

    if (role === "admin") {
      if (device_type !== "web") {
        return res.status(403).json({
          success: false,
          message: "Admin users are allowed to log in only from web devices.",
        });
      }
    } else if (role === "employee" || role === "reception") {
      if (device_type !== "mobile") {
        return res.status(403).json({
          success: false,
          message: `${role.charAt(0).toUpperCase() + role.slice(1)} users are allowed to log in only from mobile devices.`,
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Invalid user role assigned.",
      });
    }

    // Save/Update FCM Token if provided during login
    const tokenToSave = (fcm_token || fcmToken || "").trim();
    if (tokenToSave) {
      // Unbind token from any other users to ensure notifications go strictly to this logged-in user
      await pool.query(
        "UPDATE users SET fcm_token = NULL WHERE fcm_token = $1 AND id != $2",
        [tokenToSave, user.id]
      );
      await pool.query(
        "UPDATE users SET fcm_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [tokenToSave, user.id]
      );
    }

    // Fetch full name from employees table if applicable
    let full_name = user.username;
    if (user.employee_id) {
      const empRes = await pool.query(
        "SELECT full_name FROM employees WHERE employee_id = $1",
        [user.employee_id],
      );
      if (empRes.rows.length > 0) {
        full_name = empRes.rows[0].full_name;
      }
    }
    user.full_name = full_name;

    // 6. Generate JWT token
    const token = generateToken(user);

    // 7. Return user information and role
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        username: user.username,
        full_name: full_name,
        role: user.role,
        status: user.status,
        fcm_token_registered: Boolean(tokenToSave),
      },
    });
  } catch (error) {
    console.error("Error in login controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

/**
 * GET /api/me (or /api/auth/profile)
 * Fetch profile of logged in user
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const { rows } = await pool.query(
      "SELECT id, employee_id, username, role, status, fcm_token, created_at, updated_at FROM users WHERE id = $1",
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = rows[0];
    let full_name = userData.username;

    if (userData.employee_id) {
      const empRes = await pool.query(
        "SELECT full_name, email, mobile, department, designation FROM employees WHERE employee_id = $1",
        [userData.employee_id],
      );
      if (empRes.rows.length > 0) {
        userData.employee_details = empRes.rows[0];
        full_name = empRes.rows[0].full_name;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data: {
        ...userData,
        full_name,
      },
    });
  } catch (error) {
    console.error("Error in getProfile:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateFcmToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { fcm_token, fcmToken } = req.body;
    const tokenToSave = (fcm_token || fcmToken || "").trim();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (!tokenToSave) {
      return res.status(400).json({
        success: false,
        message: "fcm_token or fcmToken is required.",
      });
    }

    // Unbind token from any other user
    await pool.query(
      "UPDATE users SET fcm_token = NULL WHERE fcm_token = $1 AND id != $2",
      [tokenToSave, userId]
    );

    await pool.query(
      "UPDATE users SET fcm_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [tokenToSave, userId]
    );

    return res.status(200).json({
      success: true,
      message: "FCM token updated successfully.",
    });
  } catch (error) {
    console.error("Error in updateFcmToken:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating FCM token.",
    });
  }
};

/**
 * POST /api/logout
 */
export const logout = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      // Clear fcm_token on logout so user stops receiving notifications on logout
      await pool.query(
        "UPDATE users SET fcm_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [userId]
      );
    }
  } catch (err) {
    console.warn("Error clearing FCM token on logout:", err.message);
  }
  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
};
