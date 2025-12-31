import mysql from "mysql";

// Create MySQL connection
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "jira_management",
});

// Connect to MySQL
connection.connect((err) => {
  if (err) {
    console.error("❌ Connection error:", err.stack);
    return;
  }
  console.log("✅ Connected to MySQL (XAMPP) Database");
});

export default connection;
