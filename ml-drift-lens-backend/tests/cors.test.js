const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createCorsOptions,
  parseCorsOrigins,
  requireTrustedOrigin,
} = require("../utils/cors");

function checkOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed));
  });
}

test("allows only configured browser origins and non-browser requests", async () => {
  const options = createCorsOptions(new Set([
    "http://localhost:5173",
    "http://localhost:25173",
  ]));

  assert.equal(await checkOrigin(options, "http://localhost:5173"), true);
  assert.equal(await checkOrigin(options, "http://localhost:25173"), true);
  assert.equal(await checkOrigin(options, "https://untrusted.example"), false);
  assert.equal(await checkOrigin(options, undefined), true);
});

test("parses configured origins without whitespace or empty entries", () => {
  assert.deepEqual(
    [...parseCorsOrigins("http://localhost:25173, ,http://127.0.0.1:25173")],
    ["http://localhost:25173", "http://127.0.0.1:25173"],
  );
});

test("blocks untrusted origins from model promotion requests", () => {
  let nextCalled = false;
  let responseStatus;
  let responseBody;
  const req = { get: () => "https://untrusted.example" };
  const res = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  const originalCorsOrigins = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "http://localhost:25173";
  try {
    requireTrustedOrigin(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(responseStatus, 403);
    assert.deepEqual(responseBody, { success: false, error: "Origin not allowed" });
  } finally {
    if (originalCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = originalCorsOrigins;
    }
  }
});

test("allows trusted and non-browser origins for model promotion requests", () => {
  const makeRequest = (origin) => {
    let nextCalled = false;
    const req = { get: () => origin };
    const res = { status: () => res, json: () => res };
    requireTrustedOrigin(req, res, () => {
      nextCalled = true;
    });
    return nextCalled;
  };

  const originalCorsOrigins = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "http://localhost:25173";
  try {
    assert.equal(makeRequest("http://localhost:25173"), true);
    assert.equal(makeRequest(undefined), true);
  } finally {
    if (originalCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = originalCorsOrigins;
    }
  }
});