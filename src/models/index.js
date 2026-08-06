import { UserModel } from "./UserModel.js";
import { EmployeeModel } from "./EmployeeModel.js";
import { VisitorModel } from "./VisitorModel.js";

export async function syncAllModels() {
  try {
    await UserModel.sync();
    await EmployeeModel.sync();
    await VisitorModel.sync();

    console.log("✅ Models synced successfully");
  } catch (error) {
    console.error("❌ Model sync failed:", error);
    throw error;
  }
}