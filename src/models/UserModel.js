import { baseTableModel } from "../utils.js";

export const UserModel = {
  tableName: "users",

  columns: {
    id: "SERIAL PRIMARY KEY",
    employee_id: "VARCHAR(100)",
    username: "VARCHAR(100) UNIQUE NOT NULL",
    password: "TEXT NOT NULL",
    role: "VARCHAR(50) NOT NULL",
    status: "VARCHAR(50) DEFAULT 'active'",
    fcm_token: "TEXT",
    created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  },

  sync: async () =>
    await baseTableModel(
      UserModel.tableName,
      UserModel.columns
    ),
};