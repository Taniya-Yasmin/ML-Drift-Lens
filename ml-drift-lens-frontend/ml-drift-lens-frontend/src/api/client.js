import axios from "axios";

// In dev, Vite proxies /api/* to http://localhost:3000 (see vite.config.js),
// so a relative base URL works both in dev and once built + served behind
// the same host as the backend.
const http = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

/**
 * Every function below maps 1:1 to a real Express route.
 * No endpoint here is invented — see routes/*.js and controllers/*.js
 * in ml-drift-lens-backend.
 */

export const alertsApi = {
  list: () => http.get("/alerts").then((r) => r.data),
  create: (payload) => http.post("/alerts", payload).then((r) => r.data),
  update: (id, payload) => http.put(`/alerts/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/alerts/${id}`).then((r) => r.data),
};

export const driftApi = {
  list: () => http.get("/drift").then((r) => r.data),
  create: (payload) => http.post("/drift", payload).then((r) => r.data),
  update: (id, payload) => http.put(`/drift/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/drift/${id}`).then((r) => r.data),
};

export const modelsApi = {
  list: () => http.get("/models").then((r) => r.data),
  create: (payload) => http.post("/models", payload).then((r) => r.data),
  update: (id, payload) => http.put(`/models/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/models/${id}`).then((r) => r.data),
};

export const predictionsApi = {
  list: () => http.get("/predictions").then((r) => r.data),
  create: (payload) => http.post("/predictions", payload).then((r) => r.data),
  update: (id, payload) =>
    http.put(`/predictions/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/predictions/${id}`).then((r) => r.data),
};

export const retrainingApi = {
  list: () => http.get("/retraining").then((r) => r.data),
  create: (payload) => http.post("/retraining", payload).then((r) => r.data),
  update: (id, payload) =>
    http.put(`/retraining/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/retraining/${id}`).then((r) => r.data),
};

export default http;
