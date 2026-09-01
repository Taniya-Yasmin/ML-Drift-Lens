require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
});

module.exports = pool;
