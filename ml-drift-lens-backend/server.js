const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { createCorsOptions } = require("./utils/cors");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(cors(createCorsOptions()));
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

const metricsController = require("./controllers/metricsController");
app.get("/api/metrics", metricsController.getMetrics);

// Health and ML Service integration routes
const healthRoutes = require("./routes/healthRoutes");
app.use("/api", healthRoutes);

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

const { consumeDriftEventsOnce } = require("./services/alertingConsumer");
const { ensureActiveModelVersion } = require("./services/modelVersionBootstrap");
const consumerInterval = setInterval(() => {
  consumeDriftEventsOnce().catch((error) => {
    console.error("Drift event consumer failed", { error: error.message });
  });
}, 1000);
consumerInterval.unref();

async function startServer() {
  await ensureActiveModelVersion();
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Backend startup failed", { error: error.message });
  process.exitCode = 1;
});
