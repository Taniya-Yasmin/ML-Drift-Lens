const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ModelWatch backend is alive 🚀");
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const predictionsRoutes = require("./routes/predictionsRoutes");
app.use("/api/predictions", predictionsRoutes);

const driftRoutes = require("./routes/driftRoutes");
app.use("/api/drift", driftRoutes);

const alertsRoutes = require("./routes/alertsRoutes");
app.use("/api/alerts", alertsRoutes);

const modelsRoutes = require("./routes/modelsRoutes");
app.use("/api/models", modelsRoutes);

const retrainingRoutes = require("./routes/retrainingRoutes");
app.use("/api/retraining", retrainingRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
