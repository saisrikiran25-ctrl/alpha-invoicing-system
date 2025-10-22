const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// UPDATED: Database connection now uses environment variables for Azure
// ============================================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'alpha_invoicing_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
}

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName, companyName } = req.body;
  try {
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    // Fixed: Changed to use underscores to match standard naming
    const [userResult] = await connection.execute(
      'INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, firstName, lastName]
    );

    const userId = userResult.insertId;

    if (companyName) {
      // Fixed: Changed to use underscores to match standard naming
      await connection.execute(
        'INSERT INTO business_profiles (user_id, company_name) VALUES (?, ?)',
        [userId, companyName]
      );
    }

    await connection.commit();
    connection.release();
    res.json({ success: true, userId });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.execute(
      'SELECT user_id, email, password_hash, is_active FROM users WHERE email = ?',
      [email]
    );

    if (!rows.length || !rows[0].is_active || !await bcrypt.compare(password, rows[0].password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: rows[0].user_id, email: rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: { id: rows[0].user_id, email: rows[0].email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Protected: get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT u.email, u.first_name, u.last_name, bp.company_name FROM users u LEFT JOIN business_profiles bp ON u.user_id = bp.user_id WHERE u.user_id = ?',
      [req.user.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

// Protected: Dashboard stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      stats: {
        totalClients: 0,
        totalInvoices: 0
      }
    });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
testConnection().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});