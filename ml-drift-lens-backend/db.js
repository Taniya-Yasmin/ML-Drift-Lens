```javascript
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: require("path").resolve(__dirname, "../.env"),
  });
}

const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
});

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error", {
    code: error.code,
    name: error.name,
  });
});

module.exports = pool;
```
