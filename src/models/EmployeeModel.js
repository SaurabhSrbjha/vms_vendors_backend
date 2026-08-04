import { baseTableModel } from "../utils.js";

export const EmployeeModel = {
  tableName: "employees",

  columns: {
    id: "SERIAL PRIMARY KEY",
    employee_id: "VARCHAR(100) UNIQUE NOT NULL",
    full_name: "VARCHAR(150) NOT NULL",
    dob: "VARCHAR(50) NOT NULL",
    mobile: "VARCHAR(50) NOT NULL",
    email: "VARCHAR(150) NOT NULL",
    department: "VARCHAR(100) NOT NULL",
    designation: "VARCHAR(100) NOT NULL",
    role: "VARCHAR(50) NOT NULL",
    status: "VARCHAR(50) DEFAULT 'active'",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  },

  sync: async () =>
    await baseTableModel(
      EmployeeModel.tableName,
      EmployeeModel.columns
    ),
};
