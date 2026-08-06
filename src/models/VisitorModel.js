import { baseTableModel } from "../utils.js";

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
    notes: "TEXT",
    status: "VARCHAR(50) DEFAULT 'PENDING'",
    receptionist_id: "VARCHAR(100)",
    receptionist_name: "VARCHAR(150)",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  },

  sync: async () =>
    await baseTableModel(
      VisitorModel.tableName,
      VisitorModel.columns
    ),
};
