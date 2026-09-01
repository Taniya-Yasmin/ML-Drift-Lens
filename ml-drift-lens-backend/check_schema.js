require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");
const pool = new Pool({
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
});
pool.query(
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1",
  ["retraining_jobs"]
).then(r => {
  r.rows.forEach(c => console.log(c.column_name, "->", c.data_type));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
