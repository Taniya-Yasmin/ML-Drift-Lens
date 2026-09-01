require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");
const pool = new Pool({
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
});
pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
  .then(r => { console.log("Tables:", JSON.stringify(r.rows, null, 2)); process.exit(0); })
  .catch(e => { console.error("ERROR:", e.message); process.exit(1); });
