import pool from "./config/db.js";
import { syncAllModels } from "./models/index.js";
import { hashPassword } from "./utils.js";

async function freshSetup() {
  try {
    console.log("🔄 Starting fresh setup...");

    // 1. Sync all database tables
    console.log("📦 Syncing database models...");
    await syncAllModels();

    // 2. Clear/Truncate existing data in all tables
    console.log("🧹 Clearing all existing data from tables (users, employees, visitors)...");
    await pool.query("TRUNCATE TABLE users, employees, visitors RESTART IDENTITY CASCADE;");
    console.log("✅ All tables cleared successfully.");

    // 3. Seed Production Admin User
    const username = process.env.ADMIN_USERNAME || "ebwsVms_admin";
    const password = process.env.ADMIN_PASSWORD || "ebwsVmsAdmin@123";
    const role = "admin";
    const status = "active";

    const hashedPassword = await hashPassword(password);

    const insertQuery = `
      INSERT INTO users (username, password, role, status)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, role, status;
    `;

    const { rows } = await pool.query(insertQuery, [
      username,
      hashedPassword,
      role,
      status,
    ]);

    console.log("\n✅ Fresh Setup Completed! Only Admin User exists:");
    console.log("--------------------------------------------------");
    console.log(rows[0]);
    console.log("🔑 Username:", username);
    console.log("🔑 Password:", password);
    console.log("--------------------------------------------------\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error in fresh setup:", error);
    process.exit(1);
  }
}

freshSetup();
