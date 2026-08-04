import pool from "./config/db.js";
import { syncAllModels } from "./models/index.js";
import { hashPassword } from "./utils.js";

async function seedAdmin() {
  try {
    console.log("Syncing database models...");
    await syncAllModels();

    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const role = "admin";
    const status = "active";

    console.log(`Checking existing user with username: '${username}'`);
    const existing = await pool.query(
      "SELECT id, username, role FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      console.log(`⚠️ User with username '${username}' already exists.`);
      process.exit(0);
    }

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
    console.log("✅ Admin User seeded successfully:");
    console.log(rows[0]);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding Admin User:", error);
    process.exit(1);
  }
}

seedAdmin();
