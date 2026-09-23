import { baseTableModel } from "../utils.js";
import pool from "../config/db.js";

export const VisitorModel = {
  tableName: "visitors",

  columns: {
    id: "SERIAL PRIMARY KEY",
    visitor_id: "VARCHAR(100) UNIQUE NOT NULL",
    photo: "TEXT",
    full_name: "VARCHAR(150) NOT NULL",
    email: "VARCHAR(150)",
    mobile: "VARCHAR(50) NOT NULL",
    office_name: "VARCHAR(150)",
    host_employee_id: "VARCHAR(100) NOT NULL",
    host_employee_name: "VARCHAR(150)",
    host_department: "VARCHAR(100)",
    purpose: "VARCHAR(200)",
    visitor_type: "VARCHAR(100)",
    visit_date: "VARCHAR(50)",
    visit_time: "VARCHAR(50)",
    pass_code: "VARCHAR(50)",
    notes: "TEXT",
    status: "VARCHAR(50) DEFAULT 'PENDING'",
    receptionist_id: "VARCHAR(100)",
    receptionist_name: "VARCHAR(150)",
    check_in_time: "TIMESTAMP",
    check_out_time: "TIMESTAMP",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  },

  sync: async () => {
    await baseTableModel(
      VisitorModel.tableName,
      VisitorModel.columns
    );
    try {
      await pool.query(`
        ALTER TABLE visitors 
        ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP,
        ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP,
        ADD COLUMN IF NOT EXISTS pass_code VARCHAR(50),
        ADD COLUMN IF NOT EXISTS visit_time VARCHAR(50);
      `);
    } catch (e) {
      // Ignore if table does not exist yet
    }
  },
};

