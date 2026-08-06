import express from "express";
import cors from "cors";
import path from "path";
import routes from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static uploads folder for serving visitor photos
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api", routes);

app.get("/", (req, res) => {
  res.json({ status: "OK", message: "VMS Backend API Running" });
});

export default app;