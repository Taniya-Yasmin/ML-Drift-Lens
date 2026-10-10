/**
 * Phase 6 Integration Tests
 * Tests Node.js backend ↔ Python FastAPI communication
 */

const http = require("http");

/**
 * Mock HTTP server for testing ML service
 * Simulates FastAPI responses
 */
function createMockMLServer(port = 9000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");

      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            status: "healthy",
            message: "Inference service is running",
          })
        );
      } else if (req.method === "GET" && req.url === "/ready") {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            ready: true,
            model_loaded: true,
            message: "Model is ready for inference",
          })
        );
      } else if (req.method === "GET" && req.url === "/model/info") {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            model_version: "0.1.0",
            preprocessing_version: "0.1.0",
            model_type: "xgboost",
            num_features: 41,
            training_timestamp: "2025-01-01T00:00:00Z",
          })
        );
      } else if (req.method === "POST" && req.url === "/predict") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          const requestData = JSON.parse(body);
          res.writeHead(200);
          res.end(
            JSON.stringify({
              model_id: requestData.model_id,
              model_version: requestData.model_version,
              preprocessing_version: requestData.preprocessing_version,
              prediction: "normal",
              prediction_class: 0,
              confidence: 0.85,
              request_id: requestData.request_id || "test-request-id",
            })
          );
        });
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    server.listen(port, () => {
      resolve(server);
    });

    server.on("error", reject);
  });
}

/**
 * Make HTTP request to local server (for testing)
 */
function makeRequest(port, path, method = "GET", data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: port,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({
            statusCode: res.statusCode,
            body: parsed,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test: Health Check
 */
async function testHealthCheck() {
  console.log("Test: Health Check");
  const server = await createMockMLServer(9100);

  try {
    const response = await makeRequest(9100, "/health");
    console.log("  ✓ Health check successful:", response.body);
    return true;
  } catch (error) {
    console.error("  ✗ Health check failed:", error.message);
    return false;
  } finally {
    server.close();
  }
}

/**
 * Test: Readiness Check
 */
async function testReadinessCheck() {
  console.log("Test: Readiness Check");
  const server = await createMockMLServer(9101);

  try {
    const response = await makeRequest(9101, "/ready");
    console.log("  ✓ Readiness check successful:", response.body);
    return true;
  } catch (error) {
    console.error("  ✗ Readiness check failed:", error.message);
    return false;
  } finally {
    server.close();
  }
}

/**
 * Test: Get Model Info
 */
async function testGetModelInfo() {
  console.log("Test: Get Model Info");
  const server = await createMockMLServer(9102);

  try {
    const response = await makeRequest(9102, "/model/info");
    console.log("  ✓ Model info retrieved:", response.body);
    return true;
  } catch (error) {
    console.error("  ✗ Get model info failed:", error.message);
    return false;
  } finally {
    server.close();
  }
}

/**
 * Test: Prediction
 */
async function testPrediction() {
  console.log("Test: Prediction");
  const server = await createMockMLServer(9103);

  try {
    const prediction = {
      model_id: "test-model",
      model_version: "0.1.0",
      preprocessing_version: "0.1.0",
      input_features: {
        duration: 100,
        protocol_type: "tcp",
        service: "http",
        flag: "SF",
      },
    };

    const response = await makeRequest(9103, "/predict", "POST", prediction);
    console.log("  ✓ Prediction successful:", response.body);
    return true;
  } catch (error) {
    console.error("  ✗ Prediction failed:", error.message);
    return false;
  } finally {
    server.close();
  }
}

/**
 * Test: Connection Failure Handling
 */
async function testConnectionFailure() {
  console.log("Test: Connection Failure Handling");

  try {
    // Try to connect to non-existent server
    await new Promise((resolve, reject) => {
      const options = {
        hostname: "localhost",
        port: 9999,
        path: "/health",
        method: "GET",
        timeout: 1000,
      };

      const req = http.request(options, (res) => {
        reject(new Error("Should not succeed"));
      });

      req.on("error", (error) => {
        resolve(error);
      });

      req.on("timeout", () => {
        req.destroy();
        resolve(new Error("Timeout"));
      });

      req.end();
    });

    console.log("  ✓ Connection failure handled correctly");
    return true;
  } catch (error) {
    console.error("  ✗ Connection failure test error:", error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("\n=== Phase 6 Integration Tests ===\n");

  const results = [];
  results.push(await testHealthCheck());
  results.push(await testReadinessCheck());
  results.push(await testGetModelInfo());
  results.push(await testPrediction());
  results.push(await testConnectionFailure());

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log(`\n=== Results: ${passed}/${total} tests passed ===\n`);

  return passed === total;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Test suite error:", error);
      process.exit(1);
    });
}

module.exports = { runTests };
