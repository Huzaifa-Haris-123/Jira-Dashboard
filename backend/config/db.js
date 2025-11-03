const mysql = require('mysql');

// Create MySQL connection
const connection = mysql.createConnection({
  host: 'localhost',       // XAMPP MySQL host
  user: 'root',            // Default MySQL username
  password: '',            // Default password (empty in XAMPP)
  database: 'jira_management' // Your database name
});

// Connect to MySQL
connection.connect((err) => {
  if (err) {
    console.error('❌ Connection error:', err.stack);
    return;
  }
  console.log('✅ Connected to MySQL (XAMPP) Database');
});

module.exports = connection;
