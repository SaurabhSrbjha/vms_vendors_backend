import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client, Pool } = pkg;

export async function ensureDatabaseExists() {
  const dbName = process.env.DB_NAME || 'vms_vendor_backend';
  
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    database: 'postgres',
  });

  try {
    await client.connect();
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    if (res.rowCount === 0) {
      console.log(`🔨 Database "${dbName}" does not exist. Creating database...`);
      const escapedDbName = `"${dbName.replace(/"/g, '""')}"`;
      await client.query(`CREATE DATABASE ${escapedDbName}`);
      console.log(`✅ Database "${dbName}" created successfully.`);
    }
  } catch (err) {
    console.warn(`⚠️ Auto-creation check for database "${dbName}" skipped/failed (${err.message}). Ensure database is created manually if needed.`);
  } finally {
    await client.end().catch(() => {});
  }
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => console.log('PostgreSQL connected ✅'));

export default pool;