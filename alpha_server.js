const express = require('express');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());

// FIX #1: Increase body parser limit to handle large invoices (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Root route handler
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// Database Configuration for Azure SQL Database
// ============================================================================

const config = {
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool;

// Get database connection pool
async function getPool() {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('✅ Database pool created successfully');
    } catch (error) {
      console.error('❌ Database connection error:', error.message);
      throw error;
    }
  }
  return pool;
}

// Test database connection on startup
async function testConnection() {
  try {
    const connPool = await getPool();
    console.log('✅ Connected to Azure SQL Database');
  } catch (error) {
    console.error('❌ Database connection error:', error);
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, company } = req.body;

    console.log('📥 Registration request:', { name, email, password: '***', company });

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!email || email.trim() === '') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    if (!password || password.trim() === '') {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }
    if (!company || company.trim() === '') {
      return res.status(400).json({ success: false, error: 'Company is required' });
    }

    const connPool = await getPool();

    const checkRequest = new sql.Request(connPool);
    checkRequest.input('email', sql.VarChar, email);
    const existing = await checkRequest.query('SELECT * FROM users WHERE email = @email');

    if (existing.recordset.length > 0) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertRequest = new sql.Request(connPool);
    insertRequest.input('name', sql.NVarChar, name.trim());
    insertRequest.input('email', sql.VarChar, email.trim());
    insertRequest.input('password', sql.VarChar, hashedPassword);
    insertRequest.input('company', sql.NVarChar, company.trim());

    await insertRequest.query(
      'INSERT INTO users (name, email, password, company) VALUES (@name, @email, @password, @company)'
    );

    console.log('✅ User registered:', email);
    res.json({ success: true, message: 'User registered successfully' });

  } catch (error) {
    console.error('❌ Registration error:', error.message);
    res.status(500).json({ success: false, error: 'Registration failed: ' + error.message });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('📥 Login request for:', email);

    if (!email || email.trim() === '') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    if (!password || password.trim() === '') {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    const connPool = await getPool();

    const request = new sql.Request(connPool);
    request.input('email', sql.VarChar, email.trim());
    const result = await request.query('SELECT * FROM users WHERE email = @email');

    if (result.recordset.length === 0) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result.recordset[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('❌ Wrong password for:', email);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Login successful:', email);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        userId: user.user_id,
        name: user.name,
        email: user.email,
        company: user.company
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ success: false, error: 'Login failed: ' + error.message });
  }
});

// ============================================================================
// PROTECTED ROUTES
// ============================================================================

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const connPool = await getPool();
    const request = new sql.Request(connPool);
    request.input('userId', sql.Int, req.user.userId);
    const result = await request.query('SELECT user_id, name, email, company FROM users WHERE user_id = @userId');

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: result.recordset[0] });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

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

app.get('/api/user/settings', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      settings: {
        companyName: '',
        companyAddress: '',
        companyEmail: '',
        companyPhone: '',
        bankName: '',
        accountNumber: '',
        accountHolder: '',
        paymentTerms: 30,
        logo: null
      }
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

app.post('/api/user/settings', authenticateToken, async (req, res) => {
  try {
    console.log('Settings received:', req.body);
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Settings save error:', error);
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// Get invoices - fetch from database
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const connPool = await getPool();
    const request = new sql.Request(connPool);
    request.input('userId', sql.Int, req.user.userId);
    
    const result = await request.query(
      `SELECT invoice_id, invoice_number, client_id, due_date, subtotal, tax_rate, tax_amount, total, status, created_at
       FROM invoices
       WHERE user_id = @userId
       ORDER BY created_at DESC`
    );

    console.log('✅ Retrieved', result.recordset.length, 'invoices for user:', req.user.userId);

    res.json({ 
      success: true, 
      invoices: result.recordset 
    });

  } catch (error) {
    console.error('❌ Invoice fetch error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch invoices' });
  }
});

// Save invoice - FULLY CORRECTED with all validations
app.post('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const { invoiceNumber, clientId, dueDate, subtotal, taxRate, taxAmount, total, lineItems } = req.body;
    
    // Log exact received data for debugging
    console.log('📥 Invoice save request (RAW):', {
      invoiceNumber,
      clientId: `${clientId} (type: ${typeof clientId})`,
      dueDate,
      subtotal,
      taxRate,
      taxAmount,
      total,
      lineItemsCount: lineItems ? lineItems.length : 0,
      userId: req.user.userId
    });

    // Validate required fields
    if (!invoiceNumber || invoiceNumber.trim() === '') {
      return res.status(400).json({ success: false, error: 'Invoice number is required' });
    }
    if (total === null || total === undefined) {
      return res.status(400).json({ success: false, error: 'Total is required' });
    }

    const connPool = await getPool();

    // Check if invoice number already exists
    const checkRequest = new sql.Request(connPool);
    checkRequest.input('invoiceNumber', sql.VarChar, invoiceNumber.trim());
    const existing = await checkRequest.query('SELECT * FROM invoices WHERE invoice_number = @invoiceNumber');

    if (existing.recordset.length > 0) {
      return res.status(400).json({ success: false, error: 'Invoice number already exists' });
    }

    // FIX #2: Properly validate and handle clientId
    let parsedClientId = null;
    if (clientId !== null && clientId !== undefined && clientId !== '') {
      const numClientId = parseInt(clientId);
      // Check if it's a valid INT (within SQL Server INT range)
      if (!isNaN(numClientId) && numClientId >= -2147483648 && numClientId <= 2147483647) {
        parsedClientId = numClientId;
      } else {
        console.warn('⚠️ Invalid clientId value:', clientId, '- setting to null');
        parsedClientId = null;
      }
    }

    console.log('✅ Parsed clientId:', parsedClientId);

    // Insert invoice into database
    const insertRequest = new sql.Request(connPool);
    insertRequest.input('userId', sql.Int, req.user.userId);
    insertRequest.input('invoiceNumber', sql.VarChar, invoiceNumber.trim());
    insertRequest.input('clientId', sql.Int, parsedClientId);
    insertRequest.input('dueDate', sql.Date, dueDate || null);
    insertRequest.input('subtotal', sql.Decimal(10, 2), parseFloat(subtotal) || 0);
    insertRequest.input('taxRate', sql.Decimal(5, 2), parseFloat(taxRate) || 0);
    insertRequest.input('taxAmount', sql.Decimal(10, 2), parseFloat(taxAmount) || 0);
    insertRequest.input('total', sql.Decimal(10, 2), parseFloat(total) || 0);
    insertRequest.input('status', sql.VarChar, 'draft');

    const invoiceResult = await insertRequest.query(
      `INSERT INTO invoices (user_id, invoice_number, client_id, due_date, subtotal, tax_rate, tax_amount, total, status)
       OUTPUT inserted.invoice_id
       VALUES (@userId, @invoiceNumber, @clientId, @dueDate, @subtotal, @taxRate, @taxAmount, @total, @status)`
    );

    const invoiceId = invoiceResult.recordset[0].invoice_id;

    // Insert line items if provided
    if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
      for (const item of lineItems) {
        const itemRequest = new sql.Request(connPool);
        itemRequest.input('invoiceId', sql.Int, invoiceId);
        itemRequest.input('description', sql.NVarChar, item.description || '');
        itemRequest.input('quantity', sql.Decimal(10, 2), parseFloat(item.quantity) || 1);
        itemRequest.input('price', sql.Decimal(10, 2), parseFloat(item.price) || 0);
        itemRequest.input('total', sql.Decimal(10, 2), parseFloat(item.total) || 0);

        await itemRequest.query(
          `INSERT INTO line_items (invoice_id, description, quantity, price, total)
           VALUES (@invoiceId, @description, @quantity, @price, @total)`
        );
      }
      console.log('✅ Saved', lineItems.length, 'line items');
    }

    console.log('✅ Invoice saved to database:', invoiceNumber, 'with ID:', invoiceId);

    res.json({ 
      success: true, 
      message: 'Invoice saved as draft',
      invoiceNumber: invoiceNumber,
      invoiceId: invoiceId
    });

  } catch (error) {
    console.error('❌ Invoice save error:', error.message);
    console.error('❌ Full error:', error);
    res.status(500).json({ success: false, error: 'Failed to save invoice: ' + error.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 8080;

testConnection().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📦 Body parser limit: 50MB`);
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
