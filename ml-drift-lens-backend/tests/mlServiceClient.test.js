const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { afterEach, test } = require("node:test");

const http = require("http");
const mlServiceClient = require("../services/mlServiceClient");

const originalRequest = http.request;

afterEach(() => {
  http.request = originalRequest;
});

function mockResponse(statusCode, body) {
  const response = new EventEmitter();
  response.statusCode = statusCode;
  process.nextTick(() => {
    response.emit("data", JSON.stringify(body));
    response.emit("end");
  });
  return response;
}

function mockRequest(responseFactory) {
  http.request = (options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.write = () => {};
    request.end = () => process.nextTick(() => callback(responseFactory()));
    request.destroy = () => {};
    return request;
  };
}

test("reloadModel accepts only a response confirming the requested active model", async () => {
  mockRequest(() => mockResponse(200, {
    status: "success",
    model_id: "intrusion-detector-v1",
    active_model_version: "candidate-2026-03-01",
  }));

  const result = await mlServiceClient.reloadModel({
    model_id: "intrusion-detector-v1",
    model_version: "candidate-2026-03-01",
  });

  assert.equal(result.active_model_version, "candidate-2026-03-01");
});

test("reloadModel rejects a malformed successful response", async () => {
  mockRequest(() => mockResponse(200, {
    status: "success",
    model_id: "intrusion-detector-v1",
    active_model_version: "candidate-older-version",
  }));

  await assert.rejects(
    mlServiceClient.reloadModel({
      model_id: "intrusion-detector-v1",
      model_version: "candidate-2026-03-02",
    }),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.message, "ML Service returned an invalid reload response");
      return true;
    },
  );
});
