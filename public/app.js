// API base
const API = '/api';
;

// Generic request helper
async function api(endpoint, method, body, token) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: body && JSON.stringify(body)
  });
  return res.json();
}
// Invoice and client API helpers
async function saveInvoice(data, token) {
  return api('/invoices', 'POST', data, token);
}
async function getInvoices(token) {
  return api('/invoices', 'GET', null, token);
}
async function saveClient(data, token) {
  return api('/clients', 'POST', data, token);
}
async function getClients(token) {
  return api('/clients', 'GET', null, token);
}

// Register
async function register(data) {
  return api('/auth/register', 'POST', data);
}

// Login
async function login(data) {
  return api('/auth/login', 'POST', data);
}

// Fetch stats (protected)
async function getStats(token) {
  return api('/dashboard/stats', 'GET', null, token);
}
// User Settings API helpers (NEW)
async function saveUserSettings(data, token) {
    return api('/user/settings', 'POST', data, token);
}

async function getUserSettings(token) {
    return api('/user/settings', 'GET', null, token);
}


// ALPHA INVOICING SYSTEM - CORE ENGINE //

// State Management - Single Source of Truth
let state = {
    currentModule: 'auth', // 'auth' or 'invoicing'
    currentView: 'login', // login, signup, reset, settings, dashboard, invoice-builder
    isAuthenticated: false,
    isLoading: false,
    error: null,
    user: {
        email: '',
        name: '',
        companyName: '',
        companyAddress: '',
        companyEmail: '',
        companyPhone: '',
        bankName: '',
        accountNumber: '',
        accountHolder: '',
        paymentTerms: 30,
        logo: null
    },
    clients: [], // No sample data as requested
    invoices: [], // No sample data as requested
    currentInvoice: null,
    taxRates: [
        {value: 0, label: "0% - No Tax"},
        {value: 5, label: "5% - Reduced Rate"},
        {value: 10, label: "10% - Standard Rate"},
        {value: 15, label: "15% - Higher Rate"},
        {value: 18, label: "18% - GST Rate"},
        {value: 20, label: "20% - VAT Rate"},
        {value: 25, label: "25% - Premium Rate"}
    ],
    paymentTermsOptions: [
        {value: 15, label: "15 days"},
        {value: 30, label: "30 days"},
        {value: 45, label: "45 days"},
        {value: 60, label: "60 days"},
        {value: 90, label: "90 days"}
    ]
};

// DOM Elements Cache
const elements = {
    authModule: null,
    invoicingModule: null,
    authViews: {},
    invoicingViews: {},
    modals: {},
    forms: {}
};

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    initializeEventListeners();
    renderCurrentState();
    
    // Set default due date to 30 days from today
    const dueDateInput = document.getElementById('due-date');
    if (dueDateInput) {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 30);
        dueDateInput.value = defaultDate.toISOString().split('T')[0];
    }
    
    // Initialize dropdowns
    populateTaxRates();
    populatePaymentTermsSelect();
    
    // Wire form handlers
    document.getElementById('signup-form')?.addEventListener('submit', handleSignup);
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
});

// Element Initialization
function initializeElements() {
    elements.authModule = document.getElementById('auth-module');
    elements.invoicingModule = document.getElementById('invoicing-module');
    
    // Auth views
    elements.authViews = {
        login: document.getElementById('login-view'),
        signup: document.getElementById('signup-view'),
        reset: document.getElementById('password-reset-view')
    };
    
    // Invoicing views
    elements.invoicingViews = {
        dashboard: document.getElementById('dashboard-view'),
        builder: document.getElementById('invoice-builder-view'),
        settings: document.getElementById('settings-view')
    };
    
    // Modals
    elements.modals = {
        client: document.getElementById('client-modal'),
        preview: document.getElementById('preview-modal')
    };
    
    // Forms
    elements.forms = {
        login: document.getElementById('login-form'),
        signup: document.getElementById('signup-form'),
        reset: document.getElementById('reset-form'),
        client: document.getElementById('client-form'),
        invoice: document.getElementById('invoice-form'),
        settings: document.getElementById('settings-form')
    };
}

// Event Listeners
function initializeEventListeners() {
    // Authentication forms
    if (elements.forms.login) {
        elements.forms.login.addEventListener('submit', handleLogin);
    }
    
    if (elements.forms.signup) {
        elements.forms.signup.addEventListener('submit', handleSignup);
    }
    
    if (elements.forms.reset) {
        elements.forms.reset.addEventListener('submit', handlePasswordReset);
    }
    
    if (elements.forms.client) {
        elements.forms.client.addEventListener('submit', handleClientSave);
    }
    
    // New invoice button
    const newInvoiceBtn = document.getElementById('new-invoice-btn');
    if (newInvoiceBtn) {
        newInvoiceBtn.addEventListener('click', function(e) {
            e.preventDefault();
            createNewInvoice();
            switchInvoicingView('builder');
        });
    }
    
    // Logo upload
    const logoUpload = document.getElementById('logo-upload');
    const logoUploadZone = document.getElementById('logo-upload-zone');
    
    if (logoUpload && logoUploadZone) {
        logoUploadZone.addEventListener('click', () => logoUpload.click());
        logoUploadZone.addEventListener('dragover', handleDragOver);
        logoUploadZone.addEventListener('drop', handleFileDrop);
        logoUpload.addEventListener('change', handleFileSelect);
    }
    
    // Real-time invoice calculations - using event delegation
    document.addEventListener('input', function(e) {
        if (e.target.matches('.line-quantity, .line-price') || 
            e.target.closest('.line-item') || 
            e.target.classList.contains('line-quantity') || 
            e.target.classList.contains('line-price')) {
            setTimeout(() => calculateInvoiceTotal(), 50);
        }
    });
    
    // Tax rate change
    document.addEventListener('change', function(e) {
        if (e.target.id === 'tax-rate') {
            setTimeout(() => calculateInvoiceTotal(), 50);
        }
    });
    
    // Close modals on backdrop click...
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-backdrop')) {
            closeAllModals();
        }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

// Authentication Functions

// Signup - FIXED
async function handleSignup(e) {
  e.preventDefault();

  // Get form values
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const company = document.getElementById('signup-company').value.trim();

  // Validate all fields
  if (!name) {
    alert('Name is required');
    return;
  }
  if (!email) {
    alert('Email is required');
    return;
  }
  if (!password) {
    alert('Password is required');
    return;
  }
  if (!company) {
    alert('Company is required');
    return;
  }

  // Send CORRECT field names to backend
  const data = {
    name: name,           // ✅ CORRECT - backend expects 'name'
    email: email,
    password: password,
    company: company      // ✅ CORRECT - backend expects 'company'
  };

  console.log('📤 Sending registration:', data);

  const result = await register(data);
  if (result.success) {
    alert('✅ Registered! Now login.');
    switchAuthView('login');
  } else {
    alert('❌ Error: ' + result.error);
  }
}

// Login - FIXED
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();

  // Validate fields
  if (!email) {
    alert('Email is required');
    return;
  }
  if (!password) {
    alert('Password is required');
    return;
  }

  const data = {
    email: email,
    password: password
  };

  console.log('📤 Sending login:', data);

  const result = await login(data);

  if (result.success) {
    console.log('✅ Login successful, token:', result.token);
    localStorage.setItem('token', result.token);
    state.isAuthenticated = true;
    state.currentModule = 'invoicing';
    state.currentView = 'dashboard';
    renderCurrentState();
    alert('✅ Logged in! Welcome.');
    loadDashboard();
  } else {
    alert('❌ Error: ' + result.error);
  }
}

// Dashboard load
async function loadDashboard() {
    const token = localStorage.getItem('token');
    
    // Load invoices (existing)
    const invRes = await getInvoices(token);
    state.invoices = invRes.success ? invRes.invoices : [];
    
    // Load clients (existing)
    const cliRes = await getClients(token);
    state.clients = cliRes.success ? cliRes.clients : [];
    
    // NEW: Load user settings from database
    const settingsRes = await getUserSettings(token);
    if (settingsRes.success && settingsRes.settings) {
        Object.assign(state.user, settingsRes.settings);
    }
    
    // Update stats (existing)
    document.getElementById('totalClients').textContent = state.clients.length;
    document.getElementById('totalInvoices').textContent = state.invoices.length;
    
    renderInvoicesList();
}



function handlePasswordReset(e) {
    e.preventDefault();
    setLoading(true);
    
    const email = document.getElementById('reset-email').value;
    
    setTimeout(() => {
        if (email && isValidEmail(email)) {
            const successElement = document.getElementById('reset-success');
            if (successElement) {
                successElement.classList.remove('hidden');
            }
        } else {
            showAuthError('reset', 'Invalid Neural ID Format');
        }
        setLoading(false);
    }, 1000);
}

function logout() {
    state.isAuthenticated = false;
    state.user = {
        email: '',
        name: '',
        companyName: '',
        companyAddress: '',
        companyEmail: '',
        companyPhone: '',
        bankName: '',
        accountNumber: '',
        accountHolder: '',
        paymentTerms: 30,
        logo: null
    };
    state.currentModule = 'auth';
    state.currentView = 'login';
    renderCurrentState();
    showSystemMessage('Session Terminated: Neural Link Disconnected');
}

// Authentication View Switching
function switchAuthView(viewName) {
    state.currentView = viewName;
    
    // Add glitch effect to outgoing view
    const currentActive = document.querySelector('.auth-view.active');
    if (currentActive) {
        currentActive.style.animation = 'glitchOut 0.3s ease-out';
        setTimeout(() => {
            currentActive.classList.remove('active');
            currentActive.style.animation = '';
        }, 300);
    }
    
    // Show new view with slide-up effect
    setTimeout(() => {
        Object.values(elements.authViews).forEach(view => {
            if (view) view.classList.remove('active');
        });
        
        if (elements.authViews[viewName]) {
            elements.authViews[viewName].classList.add('active');
            elements.authViews[viewName].style.animation = 'slideUp 0.5s ease-out';
            setTimeout(() => {
                if (elements.authViews[viewName]) {
                    elements.authViews[viewName].style.animation = '';
                }
            }, 500);
        }
    }, 300);
    
    clearAuthErrors();
}

// Invoicing View Switching - FIXED
function switchInvoicingView(viewName) {
    console.log('Switching to view:', viewName); // Debug log
    state.currentView = viewName;
    
    // Update navigation buttons
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        const btnText = btn.textContent.toLowerCase();
        if ((viewName === 'dashboard' && btnText.includes('command')) ||
            (viewName === 'settings' && btnText.includes('config'))) {
            btn.classList.add('active');
        }
    });
    
    // Hide all views first
    Object.values(elements.invoicingViews).forEach(view => {
        if (view) view.classList.remove('active');
    });
    
    // Show target view
    const targetView = elements.invoicingViews[viewName];
    if (targetView) {
        targetView.classList.add('active');
        
        // Execute view-specific initialization
        if (viewName === 'dashboard') {
            renderInvoicesList();
        } else if (viewName === 'builder') {
            populateClientSelect()
            console.log('populateClientSelect called, clients:', state.clients);
            setTimeout(() => calculateInvoiceTotal(), 100);
        } else if (viewName === 'settings') {
            loadSettingsForm();
        }
    } else {
        console.error('View not found:', viewName);
    }
}

// Enhanced Settings Management
function loadSettingsForm() {
    // Populate form with current user data
    const fields = [
        ['company-name', 'companyName'],
        ['company-address', 'companyAddress'],
        ['company-email', 'companyEmail'],
        ['company-phone', 'companyPhone'],
        ['bank-name', 'bankName'],
        ['account-number', 'accountNumber'],
        ['account-holder', 'accountHolder'],
        ['payment-terms', 'paymentTerms']
    ];
    
    fields.forEach(([elementId, userProperty]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = state.user[userProperty] || (userProperty === 'paymentTerms' ? 30 : '');
        }
    });
    
    // Update logo preview if exists
    if (state.user.logo) {
        const preview = document.getElementById('logo-preview');
        const uploadContent = document.querySelector('.upload-content');
        if (preview && uploadContent) {
            preview.src = state.user.logo;
            preview.classList.remove('hidden');
            uploadContent.style.display = 'none';
        }
    }
}

async function saveSettings() {
    // Collect form data
    const settingsData = {
        companyName: document.getElementById('company-name')?.value || '',
        companyAddress: document.getElementById('company-address')?.value || '',
        companyEmail: document.getElementById('company-email')?.value || '',
        companyPhone: document.getElementById('company-phone')?.value || '',
        bankName: document.getElementById('bank-name')?.value || '',
        accountNumber: document.getElementById('account-number')?.value || '',
        accountHolder: document.getElementById('account-holder')?.value || '',
        paymentTerms: parseInt(document.getElementById('payment-terms')?.value) || 30,
        logo: state.user.logo || null
    };
    
    // Update local state (existing behavior preserved)
    Object.assign(state.user, settingsData);
    
    // NEW: Save to database
    const token = localStorage.getItem('token');
    const result = await saveUserSettings(settingsData, token);
    
    if (result.success) {
        showSystemMessage('✅ CONFIGURATION MATRIX UPDATED - Settings Saved!');
    } else {
        showSystemMessage('❌ Save failed: ' + (result.error || 'Unknown error'));
    }
}


function populatePaymentTermsSelect() {
    const select = document.getElementById('payment-terms');
    if (select) {
        select.innerHTML = '';
        state.paymentTermsOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            select.appendChild(optionElement);
        });
    }
}

// Invoice Management
function createNewInvoice() {
    const invoiceNumber = `INV-${String(state.invoices.length + 1).padStart(3, '0')}`;
    
    state.currentInvoice = {
        id: Date.now(),
        number: invoiceNumber,
        client: null,
        dueDate: '',
        lineItems: [],
        subtotal: 0,
        taxRate: 0,
        taxAmount: 0,
        total: 0,
        status: 'draft',
        createdAt: new Date().toISOString()
    };
    
    // Clear and populate form
    setTimeout(() => {
        const invoiceNumberInput = document.getElementById('invoice-number');
        if (invoiceNumberInput) {
            invoiceNumberInput.value = invoiceNumber;
        }
        
        populateClientSelect();
        clearLineItems();
        addLineItem();
        calculateInvoiceTotal();
        
        // Set default due date
        const dueDateInput = document.getElementById('due-date');
        if (dueDateInput) {
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + (state.user.paymentTerms || 30));
            dueDateInput.value = defaultDate.toISOString().split('T')[0];
        }
    }, 100);
}

function addLineItem() {
    const container = document.getElementById('line-items-container');
    if (!container) return;
    
    const itemId = Date.now() + Math.random();
    
    const lineItemHTML = `
        <div class="line-item" data-id="${itemId}">
            <div class="form-group">
                <label class="input-label">Description</label>
                <input type="text" class="form-control line-description" placeholder="Service or product description" required>
            </div>
            <div class="form-group">
                <label class="input-label">Quantity</label>
                <input type="number" class="form-control line-quantity" min="1" value="1" step="1" required>
            </div>
            <div class="form-group">
                <label class="input-label">Price</label>
                <input type="number" class="form-control line-price" min="0" step="0.01" placeholder="0.00" required>
            </div>
            <button type="button" class="remove-item-btn" onclick="removeLineItem('${itemId}')">×</button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', lineItemHTML);
    
    // Add entrance animation
    const newItem = container.querySelector(`[data-id="${itemId}"]`);
    if (newItem) {
        newItem.style.animation = 'slideIn 0.3s ease-out';
    }
}

function removeLineItem(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (item) {
        item.classList.add('removing');
        setTimeout(() => {
            item.remove();
            calculateInvoiceTotal();
        }, 300);
    }
}

function clearLineItems() {
    const container = document.getElementById('line-items-container');
    if (container) {
        container.innerHTML = '';
    }
}

// Real-time Financial Calculations
function calculateInvoiceTotal() {
    const lineItems = document.querySelectorAll('.line-item');
    let subtotal = 0;
    
    lineItems.forEach(item => {
        const quantityInput = item.querySelector('.line-quantity');
        const priceInput = item.querySelector('.line-price');
        const quantity = parseFloat(quantityInput?.value || 0);
        const price = parseFloat(priceInput?.value || 0);
        
        if (!isNaN(quantity) && !isNaN(price)) {
            subtotal += quantity * price;
        }
    });
    
    const taxRateSelect = document.getElementById('tax-rate');
    const taxRate = parseFloat(taxRateSelect?.value || 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    
    // Update display with tick-up animation
    updateAmountWithAnimation('subtotal-amount', subtotal);
    updateAmountWithAnimation('tax-amount', taxAmount);
    updateAmountWithAnimation('total-amount', total);
    
    // Update state
    if (state.currentInvoice) {
        state.currentInvoice.subtotal = subtotal;
        state.currentInvoice.taxRate = taxRate;
        state.currentInvoice.taxAmount = taxAmount;
        state.currentInvoice.total = total;
    }
}

function updateAmountWithAnimation(elementId, amount) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.add('updating');
        element.textContent = amount.toFixed(2);
        setTimeout(() => element.classList.remove('updating'), 500);
    }
}

// Client Management - FIXED
function openClientModal() {
    const form = elements.forms.client;
    if (form) {
        form.reset();
    }
    
    const modal = elements.modals.client;
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);
        
        setTimeout(() => {
            const nameInput = document.getElementById('client-name');
            if (nameInput) nameInput.focus();
        }, 100);
    }
}

function closeClientModal() {
    const modal = elements.modals.client;
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.add('hidden');
            const form = elements.forms.client;
            if (form) form.reset();
        }, 300);
    }
}

function handleClientSave(e) {
    e.preventDefault();
    
    const name = document.getElementById('client-name')?.value?.trim();
    const email = document.getElementById('client-email')?.value?.trim();
    const address = document.getElementById('client-address')?.value?.trim();
    const phone = document.getElementById('client-phone')?.value?.trim();
    
    // Validate required fields
    if (!name || !email) {
        showSystemMessage('Client name and email are required');
        return;
    }
    
    if (!isValidEmail(email)) {
        showSystemMessage('Please enter a valid email address');
        return;
    }
    
    // Create new client
    const newClient = {
        id: Date.now(),
        name,
        email,
        address: address || '',
        phone: phone || '',
        createdAt: new Date().toISOString()
    };
    
    // Add to state
    state.clients.push(newClient);
    
    // Update client dropdown
    populateClientSelect();
    
    // Auto-select the new client
    const clientSelect = document.getElementById('client-select');
    if (clientSelect) {
        clientSelect.value = newClient.id;
    }
    
    // Close modal
    closeClientModal();
    
    // Show success message
    showSystemMessage('Client Matrix Updated: New Entity Registered');
}

function populateClientSelect() {
    const select = document.getElementById('client-select');
    if (select) {
        select.innerHTML = '<option value="">Select or Add Client</option>';
        
        state.clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            select.appendChild(option);
        });
    }
}

function populateTaxRates() {
    const select = document.getElementById('tax-rate');
    if (select) {
        select.innerHTML = '';
        state.taxRates.forEach(rate => {
            const option = document.createElement('option');
            option.value = rate.value;
            option.textContent = rate.label;
            select.appendChild(option);
        });
    }
}

// Invoice Preview and Sending
function previewInvoice() {
    if (!validateInvoiceForm()) return;
    
    collectInvoiceData();
    generateInvoicePreview();
    generateEmailTemplate();
    
    const modal = elements.modals.preview;
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);
    }
}

function validateInvoiceForm() {
    const clientId = document.getElementById('client-select')?.value;
    const invoiceNumber = document.getElementById('invoice-number')?.value;
    const dueDate = document.getElementById('due-date')?.value;
    const lineItems = document.querySelectorAll('.line-item');
    
    if (!clientId || !invoiceNumber || !dueDate || lineItems.length === 0) {
        showSystemMessage('Incomplete Invoice Data Matrix');
        return false;
    }
    
    return true;
}

function collectInvoiceData() {
    const clientId = document.getElementById('client-select')?.value;
    const client = state.clients.find(c => c.id == clientId);
    
    if (state.currentInvoice) {
        state.currentInvoice.client = client;
        state.currentInvoice.number = document.getElementById('invoice-number')?.value;
        state.currentInvoice.dueDate = document.getElementById('due-date')?.value;
        
        // FIXED: Properly collect line items
        state.currentInvoice.lineItems = [];
        document.querySelectorAll('.line-item').forEach(item => {
            const description = item.querySelector('.line-description')?.value;
            const quantity = parseFloat(item.querySelector('.line-quantity')?.value);
            const price = parseFloat(item.querySelector('.line-price')?.value);
            
            if (description && quantity && price) {
                state.currentInvoice.lineItems.push({
                    description,
                    quantity,
                    price,
                    total: quantity * price
                });
            }
        });
    }
}


function generateInvoicePreview() {
    const preview = document.getElementById('invoice-preview');
    const invoice = state.currentInvoice;
    
    if (!invoice || !invoice.client || !preview) return;
    
    const dueDate = new Date(invoice.dueDate).toLocaleDateString();
    const issueDate = new Date().toLocaleDateString();
    
    preview.innerHTML = `
        <div class="invoice-header">
            <div>
                <div class="invoice-title">INVOICE</div>
                <div class="invoice-number">${invoice.number}</div>
                <div class="invoice-date">Date: ${issueDate}</div>
            </div>
            <div class="invoice-logo">
                ${state.user?.logo ? `<img src="${state.user.logo}" alt="Company Logo">` : '<div></div>'}
            </div>
        </div>
        
        <div class="invoice-details">
            <div class="invoice-section">
                <h4>Seller</h4>
                <p><strong>${state.user.companyName || state.user.name || 'Your Company'}</strong></p>
                ${state.user.companyAddress ? `<p>${state.user.companyAddress.replace(/\n/g, '<br>')}</p>` : ''}
                ${state.user.companyEmail ? `<p>Mail: ${state.user.companyEmail}</p>` : ''}
                ${state.user.companyPhone ? `<p>Phone: ${state.user.companyPhone}</p>` : ''}
            </div>
            
            <div class="invoice-section">
                <h4 style="color: black">Bill To</h4>
                <p><strong>${invoice.client.name}</strong></p>
                ${invoice.client.address ? `<p>${invoice.client.address.replace(/\n/g, '<br>')}</p>` : ''}
                <p>Mail: ${invoice.client.email}</p>
                ${invoice.client.phone ? `<p>Phone: ${invoice.client.phone}</p>` : ''}
            </div>
        </div>
        
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>No.</th>
                    <th>Description</th>
                    <th>Quantity</th>
                    <th>Item Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${invoice.lineItems.map((item, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${item.description}</td>
                        <td>${item.quantity}</td>
                        <td>${item.price.toFixed(2)}</td>
                        <td>${item.total.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div class="invoice-totals">
            <div class="total-row">
                <span>Subtotal</span>
                <span>${invoice.subtotal.toFixed(2)}</span>
            </div>
            <div class="total-row">
                <span>Tax (${invoice.taxRate}%)</span>
                <span>${invoice.taxAmount.toFixed(2)}</span>
            </div>
            <div class="total-row final">
                <span>Grand Total</span>
                <span>${invoice.total.toFixed(2)}</span>
            </div>
        </div>
        
        <div class="invoice-footer">
            <h4>Notes</h4>
            <p>1. Payment is due within ${state.user.paymentTerms || 30} days from the date of the invoice.</p>
            <p>2. Please make payment to the following bank account:</p>
            ${state.user.bankName ? `
                <div class="bank-details">
                    <p><strong>Bank Name:</strong> ${state.user.bankName}</p>
                    ${state.user.accountNumber ? `<p><strong>Account Number:</strong> ${state.user.accountNumber}</p>` : ''}
                    ${state.user.accountHolder ? `<p><strong>Account Holder:</strong> ${state.user.accountHolder}</p>` : ''}
                </div>
            ` : ''}
            <div class="thank-you">Thank You for Your Business</div>
        </div>
    `;
}

// Enhanced PDF Download with Seamless Functionality
function downloadInvoice() {
    const invoice = state.currentInvoice;
    if (!invoice || !invoice.client) {
        showSystemMessage('No invoice data available for download');
        return;
    }
    
    // Show download progress
    const downloadButton = document.getElementById('download-button');
    const buttonText = downloadButton?.querySelector('.button-text');
    const downloadProgress = downloadButton?.querySelector('.download-progress');
    
    if (buttonText && downloadProgress) {
        buttonText.textContent = 'Generating PDF...';
        downloadProgress.classList.remove('hidden');
        downloadButton.disabled = true;
    }
    
    // Small delay to show progress animation
    setTimeout(() => {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // HEADER SECTION with dark blue background
            doc.setFillColor(44, 62, 80); // Dark blue (#2C3E50)
            doc.rect(0, 0, 210, 40, 'F');
            
            // Company name - white text on blue background
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text(state.user.companyName || state.user.name || 'Alpha Industries', 20, 25);
            
            // INVOICE title - right side, white text
            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            doc.text('INVOICE', 150, 25);
            
            // Invoice details below header - black text on white
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Invoice No: ${invoice.number}`, 150, 48);
            doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, 150, 55);
            
            // Company logo if available
            if (state.user?.logo) {
                try {
                    doc.addImage(state.user.logo, 'JPEG', 20, 45, 30, 15);
                } catch (e) {
                    console.log('Could not add logo to PDF');
                }
            }
            
            // TWO-COLUMN ADDRESS LAYOUT
            let yPos = 75;
            
            // Seller section (left column)
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('Seller:', 20, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            yPos += 8;
            doc.text(state.user.companyName || state.user.name || 'Your Company', 20, yPos);
            
            if (state.user.companyAddress) {
                const addressLines = state.user.companyAddress.split('\n');
                addressLines.forEach(line => {
                    yPos += 6;
                    doc.text(line, 20, yPos);
                });
            }
            
            if (state.user.companyEmail) {
                yPos += 6;
                doc.text(`Mail: ${state.user.companyEmail}`, 20, yPos);
            }
            
            if (state.user.companyPhone) {
                yPos += 6;
                doc.text(`Phone: ${state.user.companyPhone}`, 20, yPos);
            }
            
            // Bill To section (right column)
            yPos = 75;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Bill To:', 110, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            yPos += 8;
            doc.text(invoice.client.name, 110, yPos);
            
            if (invoice.client.address) {
                const clientAddressLines = invoice.client.address.split('\n');
                clientAddressLines.forEach(line => {
                    yPos += 6;
                    doc.text(line, 110, yPos);
                });
            }
            
            yPos += 6;
            doc.text(`Mail: ${invoice.client.email}`, 110, yPos);
            
            if (invoice.client.phone) {
                yPos += 6;
                doc.text(`Phone: ${invoice.client.phone}`, 110, yPos);
            }
            
            // PROFESSIONAL TABLE
            yPos = 120;
            
            // Table header with gray background
            doc.setFillColor(240, 240, 240);
            doc.rect(20, yPos, 170, 8, 'F');
            
            // Table borders
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.5);
            doc.rect(20, yPos, 170, 8);
            
            // Header text...
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(44, 62, 80); // Dark blue text
            doc.text('No.', 25, yPos + 5);
            doc.text('Description', 40, yPos + 5);
            doc.text('Quantity', 110, yPos + 5);
            doc.text('Item Price', 130, yPos + 5);
            doc.text('Total', 160, yPos + 5);
            
            // Table rows with alternating colors
            yPos += 8;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            
            invoice.lineItems.forEach((item, index) => {
                // Alternating row colors
                if (index % 2 === 0) {
                    doc.setFillColor(250, 250, 250);
                    doc.rect(20, yPos, 170, 8, 'F');
                }
                
                // Row borders
                doc.rect(20, yPos, 170, 8);
                
                // Row data
                doc.text((index + 1).toString(), 25, yPos + 5);
                doc.text(item.description.substring(0, 35), 40, yPos + 5);
                doc.text(item.quantity.toString(), 110, yPos + 5);
                doc.text(item.price.toFixed(2), 130, yPos + 5);
                doc.text(item.total.toFixed(2), 160, yPos + 5);
                
                yPos += 8;
            });
            
            // SUMMARY SECTION - right-aligned
            yPos += 10;
            const summaryX = 130;
            
            // Subtotal
            doc.setFont('helvetica', 'normal');
            doc.text('Subtotal:', summaryX, yPos);
            doc.text(invoice.subtotal.toFixed(2), 170, yPos);
            
            // Tax
            yPos += 8;
            doc.text(`Tax (${invoice.taxRate}%):`, summaryX, yPos);
            doc.text(invoice.taxAmount.toFixed(2), 170, yPos);
            
            // Grand total with dark blue background
            yPos += 8;
            doc.setFillColor(44, 62, 80);
            doc.rect(summaryX - 5, yPos - 3, 65, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text('Grand Total:', summaryX, yPos + 3);
            doc.text(invoice.total.toFixed(2), 170, yPos + 3);
            
            // FOOTER SECTION
            yPos += 25;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('Notes:', 20, yPos);
            yPos += 8;
            doc.text(`1. Payment is due within ${state.user.paymentTerms || 30} days from the date of the invoice.`, 25, yPos);
            yPos += 6;
            doc.text('2. Please make payment to the following bank account:', 25, yPos);
            
            if (state.user.bankName) {
                yPos += 8;
                doc.text(`Bank Name: ${state.user.bankName}`, 30, yPos);
                if (state.user.accountNumber) {
                    yPos += 6;
                    doc.text(`Account Number: ${state.user.accountNumber}`, 30, yPos);
                }
                if (state.user.accountHolder) {
                    yPos += 6;
                    doc.text(`Account Holder: ${state.user.accountHolder}`, 30, yPos);
                }
            }
            
            // Thank you message
            yPos += 15;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Thank You for Your Business!', 105, yPos, null, null, 'center');
            
            // Generate filename and download seamlessly
            const clientName = invoice.client.name.replace(/[^a-zA-Z0-9]/g, '').replace(/\s+/g, '-');
            const filename = `Invoice-${invoice.number}-${clientName}.pdf`;
            
            // Create blob and trigger download
            const pdfBlob = doc.output('blob');
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up blob URL to prevent memory leaks
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            showSystemMessage('Invoice PDF Downloaded Successfully');
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            showSystemMessage('Error generating PDF. Please try again.');
        }
        
        // Reset button state
        if (buttonText && downloadProgress) {
            buttonText.textContent = 'Download Invoice';
            downloadProgress.classList.add('hidden');
            downloadButton.disabled = false;
        }
    }, 800); // Delay to show progress animation
}

function generateEmailTemplate() {
    const invoice = state.currentInvoice;
    if (!invoice || !invoice.client) return;
    
    const dueDate = new Date(invoice.dueDate);
    const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
    
    const template = `Dear ${invoice.client.name},

Thank you for your business. Please find attached your invoice ${invoice.number} for the amount of $${invoice.total.toFixed(2)}.

Payment is due within ${daysUntilDue} days.

If you have any questions, please don't hesitate to contact us.

Best regards,
${state.user?.name || 'Alpha Financial Systems'}`;
    
    const emailBody = document.getElementById('email-body');
    if (emailBody) {
        emailBody.value = template;
    }
}

function closePreviewModal() {
    const modal = elements.modals.preview;
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function sendInvoice() {
    const invoice = state.currentInvoice;
    if (!invoice || !invoice.client) {
        showSystemMessage('No invoice or client data available');
        return;
    }

    // First, properly collect the current invoice data
    collectInvoiceData();
    
    // Generate email content
    const subject = encodeURIComponent(`Invoice ${invoice.number} - ${state.user.companyName || 'Alpha Industries'}`);
    
    const dueDate = new Date(invoice.dueDate);
    const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
    const dueDateFormatted = dueDate.toLocaleDateString();
    
    // Create concise email body (to avoid Gmail URL limits)
    const emailBody = encodeURIComponent(`Dear ${invoice.client.name},

Please find your invoice details below:

Invoice: ${invoice.number}
Amount: $${invoice.total.toFixed(2)}
Due Date: ${dueDateFormatted}

Payment is due within ${daysUntilDue} days.

${state.user.bankName ? `Payment Details:
Bank: ${state.user.bankName}
Account: ${state.user.accountNumber || 'Contact us for details'}

` : ''}Best regards,
${state.user.name || 'Alpha Financial System'}
${state.user.companyName || 'Alpha Industries'}
${state.user.companyEmail || ''}`);

    // Create Gmail compose URL
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(invoice.client.email)}&su=${subject}&body=${emailBody}`;
    
    // Update button to show "Opening Gmail..."
    const button = document.getElementById('send-button');
    const buttonText = button?.querySelector('.button-text');
    const sendingWave = button?.querySelector('.sending-wave');
    
    if (buttonText && sendingWave) {
        buttonText.textContent = 'Opening Gmail...';
        sendingWave.classList.remove('hidden');
        button.disabled = true;
    }
    
    // Open Gmail in new tab
    window.open(gmailUrl, '_blank');
    
    // Update invoice status
    invoice.status = 'sent';
    invoice.sentAt = new Date().toISOString();
    const idx = state.invoices.findIndex(inv => inv.id === invoice.id);
    if (idx >= 0) state.invoices[idx] = { ...invoice };
    else state.invoices.push({ ...invoice });
    
    // Reset button after short delay
    setTimeout(() => {
        if (buttonText && sendingWave) {
            buttonText.textContent = 'Gmail Opened';
            sendingWave.classList.add('hidden');
            button.style.background = 'linear-gradient(135deg, #00FF7F, rgba(0, 255, 127, 0.8))';
        }
        setTimeout(() => {
            closePreviewModal();
            switchInvoicingView('dashboard');
            showSystemMessage('Gmail opened with invoice email ready to send');
            button.disabled = false;
            if (buttonText) buttonText.textContent = 'Send Invoice';
            button.style.background = '';
        }, 1500);
    }, 1000);
}


async function saveDraft() {
    if (!validateInvoiceForm()) return;
    collectInvoiceData();
    const token = localStorage.getItem('token');
    
    const payload = {
        invoiceNumber: state.currentInvoice.number,
        clientId: state.currentInvoice.client.id,
        dueDate: state.currentInvoice.dueDate,
        lineItems: state.currentInvoice.lineItems,
        subtotal: state.currentInvoice.subtotal,
        taxRate: state.currentInvoice.taxRate,
        taxAmount: state.currentInvoice.taxAmount,
        total: state.currentInvoice.total
    };
    
    const result = await saveInvoice(payload, token);
    if (result.success) {
        showSystemMessage('Invoice Saved');
        loadDashboard();
        switchInvoicingView('dashboard');
    } else {
        showSystemMessage('Error: ' + result.error);
    }
}

// Dashboard and Invoice List
function renderInvoicesList() {
    const container = document.getElementById('invoices-list');
    if (!container) return;
    
    if (state.invoices.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>No invoices in the system. Initialize your first invoice to begin.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.invoices
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(invoice => `
            <div class="invoice-item" onclick="editInvoice('${invoice.id}')">
                <div class="invoice-info">
                    <h4>${invoice.client?.name || 'Unknown Client'}</h4>
                    <p>${invoice.number} • $${invoice.total.toFixed(2)}</p>
                    <p>${getInvoiceStatusText(invoice)}</p>
                </div>
                <div class="status-indicator ${invoice.status}">
                    ${getStatusIcon(invoice.status)} ${invoice.status.toUpperCase()}
                </div>
            </div>
        `).join('');
}

function getInvoiceStatusText(invoice) {
    const dueDate = new Date(invoice.dueDate);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    if (invoice.status === 'paid') return 'Payment received';
    if (invoice.status === 'overdue') return `${Math.abs(daysUntilDue)} days overdue`;
    if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)} days overdue`;
    return `Due in ${daysUntilDue} days`;
}

function getStatusIcon(status) {
    const icons = {
        'draft': '📝',
        'sent': '📤',
        'paid': '✅',
        'overdue': '⚠️'
    };
    return icons[status] || '📄';
}

function editInvoice(invoiceId) {
    const invoice = state.invoices.find(inv => inv.id == invoiceId);
    if (invoice) {
        state.currentInvoice = { ...invoice };
        loadInvoiceToForm();
        switchInvoicingView('builder');
    }
}

function loadInvoiceToForm() {
    const invoice = state.currentInvoice;
    if (!invoice) return;
    
    setTimeout(() => {
        const invoiceNumberInput = document.getElementById('invoice-number');
        const dueDateInput = document.getElementById('due-date');
        const clientSelect = document.getElementById('client-select');
        const taxRateSelect = document.getElementById('tax-rate');
        
        if (invoiceNumberInput) invoiceNumberInput.value = invoice.number;
        if (dueDateInput) dueDateInput.value = invoice.dueDate;
        if (clientSelect) clientSelect.value = invoice.client?.id;
        if (taxRateSelect) taxRateSelect.value = invoice.taxRate;
        
        // Load line items
        clearLineItems();
        invoice.lineItems.forEach(item => {
            addLineItem();
            const lastItem = document.querySelector('.line-item:last-child');
            if (lastItem) {
                const descInput = lastItem.querySelector('.line-description');
                const qtyInput = lastItem.querySelector('.line-quantity');
                const priceInput = lastItem.querySelector('.line-price');
                
                if (descInput) descInput.value = item.description;
                if (qtyInput) qtyInput.value = item.quantity;
                if (priceInput) priceInput.value = item.price;
            }
        });
        
        calculateInvoiceTotal();
    }, 100);
}

// File Upload Handling
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processLogoFile(file);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        processLogoFile(file);
    }
}

function processLogoFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('logo-preview');
        const uploadContent = document.querySelector('.upload-content');
        
        if (preview && uploadContent) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            uploadContent.style.display = 'none';
            
            // Store in state
            state.user.logo = e.target.result;
        }
    };
    reader.readAsDataURL(file);
}

// State Rendering
function renderCurrentState() {
    if (state.currentModule === 'auth') {
        if (elements.authModule) {
            elements.authModule.style.display = 'block';
        }
        if (elements.invoicingModule) {
            elements.invoicingModule.classList.add('hidden');
            elements.invoicingModule.classList.remove('active');
        }
    } else {
        if (elements.authModule) {
            elements.authModule.style.display = 'none';
        }
        if (elements.invoicingModule) {
            elements.invoicingModule.classList.remove('hidden');
            elements.invoicingModule.classList.add('active');
        }
        
        renderInvoicesList();
        populateClientSelect();
    }
}

// Utility Functions
function setLoading(isLoading) {
    state.isLoading = isLoading;
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        if (isLoading) {
            form.classList.add('loading');
        } else {
            form.classList.remove('loading');
        }
    });
}

function showAuthError(viewName, message) {
    const errorElement = document.getElementById(`${viewName}-error`);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        setTimeout(() => errorElement.classList.add('hidden'), 5000);
    }
}

function clearAuthErrors() {
    document.querySelectorAll('.system-error').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.system-success').forEach(el => el.classList.add('hidden'));
}

function showSystemMessage(message) {
    // Create floating system message
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-notification';
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 255, 255, 0.1);
        border: 1px solid rgba(0, 255, 255, 0.3);
        color: #00FFFF;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        z-index: 3000;
        animation: slideInRight 0.3s ease-out;
        backdrop-filter: blur(10px);
        text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
    `;
    
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

function closeAllModals() {
    Object.values(elements.modals).forEach(modal => {
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Global functions for HTML onclick handlers
window.switchAuthView = switchAuthView;
window.switchInvoicingView = switchInvoicingView;
window.logout = logout;
window.openClientModal = openClientModal;
window.closeClientModal = closeClientModal;
window.closePreviewModal = closePreviewModal;
window.addLineItem = addLineItem;
window.removeLineItem = removeLineItem;
window.previewInvoice = previewInvoice;
window.sendInvoice = sendInvoice;
window.downloadInvoice = downloadInvoice;
window.saveDraft = saveDraft;
window.saveSettings = saveSettings;
window.editInvoice = editInvoice;