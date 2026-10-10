/**
 * Health Check Controller
 * Exposes ML service health and readiness status
 */

const mlServiceClient = require("../services/mlServiceClient");
const pool = require("../db");

/**
 * GET /api/health
 * Check if ML service is alive
 */
exports.health = async (req, res) => {
  const [databaseResult, mlServiceResult] = await Promise.allSettled([
    pool.query("SELECT 1"),
    mlServiceClient.checkHealth(),
  ]);
  const databaseConnected = databaseResult.status === "fulfilled";
  const mlServiceHealthy = mlServiceResult.status === "fulfilled" && mlServiceResult.value.healthy;
  const healthy = databaseConnected && mlServiceHealthy;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    service: "modelwatch-backend",
    database_connected: databaseConnected,
    ml_service_healthy: mlServiceHealthy,
    message: healthy ? "Backend dependencies are healthy" : "One or more backend dependencies are unavailable",
  });
};

/**
 * GET /api/ready
 * Check if ML service is ready (model loaded)
 */
exports.ready = async (req, res) => {
  try {
    const readiness = await mlServiceClient.checkReady();
    const statusCode = readiness.ready ? 200 : 503;
    res.status(statusCode).json({
      ready: readiness.ready,
      model_loaded: readiness.modelLoaded,
      message: readiness.message,
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      model_loaded: false,
      message: "Failed to check ML service readiness",
    });
  }
};

/**
 * GET /api/model-info
 * Get current model metadata and information
 */
exports.getModelInfo = async (req, res) => {
  try {
    const modelInfo = await mlServiceClient.getModelInfo();
    res.json({
      success: true,
      model: modelInfo,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: "Failed to retrieve model information",
      details: error.message,
    });
  }
};
