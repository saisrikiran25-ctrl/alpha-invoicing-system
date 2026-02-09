-- ============================================================================
-- ALPHA INVOICING SYSTEM - DATABASE SCHEMA
-- Database: alpha_invoicing_db
-- SQL Server Type: Azure SQL Database
-- ============================================================================

-- Create Users Table (for authentication and user profiles)
CREATE TABLE users (
    user_id INT PRIMARY KEY IDENTITY(1,1),
    name NVARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    company NVARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- Create User Settings Table (for company info, bank details, logo)
CREATE TABLE user_settings (
    setting_id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    company_name NVARCHAR(100),
    company_address NVARCHAR(500),
    company_email VARCHAR(100),
    company_phone VARCHAR(20),
    bank_name NVARCHAR(100),
    account_number VARCHAR(50),
    account_holder NVARCHAR(100),
    payment_terms INT DEFAULT 30,
    logo NVARCHAR(MAX),  -- Base64 encoded image or URL
    updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create Clients Table (for invoice recipients)
CREATE TABLE clients (
    client_id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    name NVARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    address NVARCHAR(500),
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create Invoices Table (main invoice records)
CREATE TABLE invoices (
    invoice_id INT PRIMARY KEY IDENTITY(1,1),
    user_id INT NOT NULL,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    client_id INT,
    due_date DATE,
    subtotal DECIMAL(10, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft',  -- draft, sent, paid
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE SET NULL
);

-- Create Line Items Table (individual items in each invoice)
CREATE TABLE line_items (
    line_item_id INT PRIMARY KEY IDENTITY(1,1),
    invoice_id INT NOT NULL,
    description NVARCHAR(500) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE
);

-- Create Indexes for Performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_invoices_user ON invoices(user_id);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_line_items_invoice ON line_items(invoice_id);
CREATE INDEX idx_user_settings_user ON user_settings(user_id);
