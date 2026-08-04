import dotenv from "dotenv";
import app from "./app.js";
import { syncAllModels } from "./models/index.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

syncAllModels().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});