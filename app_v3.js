// ALPHA INVOICING SYSTEM - STATIC CORE CONFIGURATION //

// ============================================================================
// DATA PERSISTENCE LAYER (LocalStorage)
// ============================================================================
const Storage = {
    KEYS: {
        INVOICES: 'alpha_invoices',
        CLIENTS: 'alpha_clients',
        SETTINGS: 'alpha_settings',
        USER: 'alpha_user_profile'
    },

    get(key, defaultValue) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error(`Error reading ${key} from storage:`, e);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error(`Error writing ${key} to storage:`, e);
            return false;
        }
    },

    // Specific Data Helpers
    getInvoices() { return this.get(this.KEYS.INVOICES, []); },
    saveInvoices(invoices) { return this.set(this.KEYS.INVOICES, invoices); },

    getClients() { return this.get(this.KEYS.CLIENTS, []); },
    saveClients(clients) { return this.set(this.KEYS.CLIENTS, clients); },

    getSettings() { return this.get(this.KEYS.SETTINGS, {}); },
    saveSettings(settings) { return this.set(this.KEYS.SETTINGS, settings); },

    // User profile is now part of settings/local state, but we keep a separate key if needed for structure
    getUser() {
        return this.get(this.KEYS.USER, {
            name: 'Admin User',
            email: 'admin@alpha.local',
            company: 'My Company'
        });
    }
};


// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let state = {
    currentModule: 'invoicing', // ALWAYS invoicing
    currentView: 'dashboard',
    isAuthenticated: true, // ALWAYS true
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
    clients: [],
    invoices: [],
    currentInvoice: null,
    taxRates: [
        { value: 0, label: "0% - No Tax" },
        { value: 5, label: "5% - Reduced Rate" },
        { value: 10, label: "10% - Standard Rate" },
        { value: 15, label: "15% - Higher Rate" },
        { value: 18, label: "18% - GST Rate" },
        { value: 20, label: "20% - VAT Rate" },
        { value: 25, label: "25% - Premium Rate" }
    ],
    paymentTermsOptions: [
        { value: 15, label: "15 days" },
        { value: 30, label: "30 days" },
        { value: 45, label: "45 days" },
        { value: 60, label: "60 days" },
        { value: 90, label: "90 days" }
    ]
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const elements = {
    invoicingModule: null,
    invoicingViews: {},
    modals: {},
    forms: {}
};

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', function () {
    initializeElements();
    initializeEventListeners();

    // Load initial data from Storage
    loadDataFromStorage();

    // Set default due date
    const dueDateInput = document.getElementById('due-date');
    if (dueDateInput) {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 30);
        dueDateInput.value = defaultDate.toISOString().split('T')[0];
    }

    // Initialize dropdowns
    populateTaxRates();
    populatePaymentTermsSelect();

    // Directly load dashboard
    loadDashboard();
    renderCurrentState();

    // Remove loading overlay
    const loader = document.getElementById('app-loading');
    if (loader) loader.style.display = 'none';
});

function loadDataFromStorage() {
    state.invoices = Storage.getInvoices();
    state.clients = Storage.getClients();

    // Merge stored settings into user state
    const savedSettings = Storage.getSettings();
    const savedUser = Storage.getUser();
    Object.assign(state.user, savedUser, savedSettings);

    console.log('✅ System Loaded: Auth Bypassed, Storage Connected');
}

function initializeElements() {
    elements.invoicingModule = document.getElementById('invoicing-module');

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
        client: document.getElementById('client-form'),
        invoice: document.getElementById('invoice-form'),
        settings: document.getElementById('settings-form')
    };
}

function initializeEventListeners() {
    // Client Form
    if (elements.forms.client) {
        elements.forms.client.addEventListener('submit', handleClientSave);
    }

    // New invoice button
    const newInvoiceBtn = document.getElementById('new-invoice-btn');
    if (newInvoiceBtn) {
        newInvoiceBtn.addEventListener('click', function (e) {
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

    // Real-time invoice calculations
    document.addEventListener('input', function (e) {
        if (e.target.matches('.line-quantity, .line-price') ||
            e.target.closest('.line-item') ||
            e.target.classList.contains('line-quantity') ||
            e.target.classList.contains('line-price')) {
            setTimeout(() => calculateInvoiceTotal(), 50);
        }
    });

    // Tax rate change
    document.addEventListener('change', function (e) {
        if (e.target.id === 'tax-rate') {
            setTimeout(() => calculateInvoiceTotal(), 50);
        }
    });

    // Modal closing
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('modal-backdrop')) {
            closeAllModals();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}


// ============================================================================
// CORE FUNCTIONS (Refactored for Static Use)
// ============================================================================

function loadDashboard() {
    // Update stats
    document.getElementById('totalClients').textContent = state.clients.length;
    document.getElementById('totalInvoices').textContent = state.invoices.length;

    renderInvoicesList();
}

function renderCurrentState() {
    // Always show invoicing module, hide everything else (if any remains)
    if (elements.invoicingModule) {
        elements.invoicingModule.classList.remove('hidden');
    }

    // Initialize current view
    switchInvoicingView(state.currentView);
}

function switchInvoicingView(viewName) {
    state.currentView = viewName;

    // Update navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        const btnText = btn.textContent.toLowerCase();
        if ((viewName === 'dashboard' && btnText.includes('command')) ||
            (viewName === 'settings' && btnText.includes('config'))) {
            btn.classList.add('active');
        }
    });

    // Hide all views
    Object.values(elements.invoicingViews).forEach(view => {
        if (view) view.classList.remove('active');
    });

    // Show target view
    const targetView = elements.invoicingViews[viewName];
    if (targetView) {
        targetView.classList.add('active');

        // View-specific logic
        if (viewName === 'dashboard') {
            loadDashboard(); // Refresh data
        } else if (viewName === 'builder') {
            populateClientSelect();
            setTimeout(() => calculateInvoiceTotal(), 100);
        } else if (viewName === 'settings') {
            loadSettingsForm();
        }
    }
}

// ----------------------------------------------------------------------------
// INVOICE MANAGEMENT
// ----------------------------------------------------------------------------

function createNewInvoice() {
    // Generate simple ID based on timestamp + random
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

    // Reset UI
    setTimeout(() => {
        const invoiceNumberInput = document.getElementById('invoice-number');
        if (invoiceNumberInput) invoiceNumberInput.value = invoiceNumber;

        populateClientSelect();
        clearLineItems();
        addLineItem();
        calculateInvoiceTotal();

        const dueDateInput = document.getElementById('due-date');
        if (dueDateInput) {
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + (state.user.paymentTerms || 30));
            dueDateInput.value = defaultDate.toISOString().split('T')[0];
        }
    }, 100);
}

// NOTE: This function mimics the original 'saveInvoice' but executes purely locally
async function saveInvoiceFunc() {
    if (!validateInvoiceForm()) return;
    collectInvoiceData();

    // Check for duplicate number
    const existingIndex = state.invoices.findIndex(inv => inv.number === state.currentInvoice.number && inv.id !== state.currentInvoice.id);
    if (existingIndex >= 0) {
        showSystemMessage('❌ Error: Invoice number already exists');
        return;
    }

    // Update or Add
    const index = state.invoices.findIndex(inv => inv.id === state.currentInvoice.id);
    if (index >= 0) {
        state.invoices[index] = state.currentInvoice;
    } else {
        state.invoices.push(state.currentInvoice);
    }

    // PERSIST TO STORAGE
    if (Storage.saveInvoices(state.invoices)) {
        showSystemMessage('✅ Invoice Saved locally!');
        switchInvoicingView('dashboard');
    } else {
        showSystemMessage('❌ Error: Failed to save to local storage');
    }
}

function renderInvoicesList() {
    const listBody = document.getElementById('invoices-list-body');
    // If table structure doesn't exist, we might need to create it or handle differently
    // Checking index.html, it seems I need to verify if there's a table there.
    // The previous view_file of index.html showed <div id="invoices-list" class="invoices-container">
    // So I need to adapt the renderer to match the HTML structure or update HTML too.
    // Let's stick to the previous HTML for list if possible or update it.

    const container = document.getElementById('invoices-list');
    if (!container) return;

    container.innerHTML = '';

    if (state.invoices.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>No invoices in the system. Initialize your first invoice to begin.</p>
            </div>
        `;
        return;
    }

    // Create Table Structure
    const tableHTML = `
        <table class="invoices-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Client</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="invoices-list-body">
            </tbody>
        </table>
    `;
    container.innerHTML = tableHTML;
    const tbody = document.getElementById('invoices-list-body');

    // Sort by date desc
    const sortedInvoices = [...state.invoices].sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );

    sortedInvoices.forEach(inv => {
        const clientName = state.clients.find(c => c.id == inv.client)?.name || 'Unknown Entity';
        const date = new Date(inv.createdAt).toLocaleDateString();
        const total = parseFloat(inv.total).toFixed(2);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="invoice-id-cell">${inv.number}</span></td>
            <td>${clientName}</td>
            <td>${date}</td>
            <td>₹${total}</td>
            <td><span class="status-badge status-${inv.status || 'draft'}">${inv.status || 'draft'}</span></td>
            <td>
                <button class="action-btn" onclick="editInvoice(${inv.id})">EDIT</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editInvoice(id) {
    const invoice = state.invoices.find(inv => inv.id === id);
    if (!invoice) return;

    state.currentInvoice = JSON.parse(JSON.stringify(invoice)); // Deep copy
    switchInvoicingView('builder');

    // Populate form
    setTimeout(() => {
        document.getElementById('invoice-number').value = invoice.number;
        document.getElementById('client-select').value = invoice.client;
        if (invoice.dueDate) document.getElementById('due-date').value = invoice.dueDate.split('T')[0];
        document.getElementById('tax-rate').value = invoice.taxRate;

        clearLineItems();
        // Re-add line items
        if (invoice.lineItems && invoice.lineItems.length > 0) {
            invoice.lineItems.forEach(item => addLineItemWithData(item));
        } else {
            addLineItem();
        }

        calculateInvoiceTotal();
    }, 100);
}

function addLineItemWithData(data) {
    const container = document.getElementById('line-items-container');
    if (!container) return;

    const itemId = Date.now() + Math.random();

    const lineItemHTML = `
        <div class="line-item" data-id="${itemId}">
            <div class="form-group">
                <label class="input-label">Description</label>
                <input type="text" class="form-control line-description" value="${data.description}" required>
            </div>
            <div class="form-group">
                <label class="input-label">Quantity</label>
                <input type="number" class="form-control line-quantity" min="1" step="1" value="${data.quantity}" required>
            </div>
            <div class="form-group">
                <label class="input-label">Price</label>
                <input type="number" class="form-control line-price" min="0" step="0.01" value="${data.price}" required>
            </div>
            <button type="button" class="remove-item-btn" onclick="removeLineItem('${itemId}')">×</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', lineItemHTML);
}

// ----------------------------------------------------------------------------
// SETTINGS MANAGEMENT
// ----------------------------------------------------------------------------

function loadSettingsForm() {
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

    // Update State
    Object.assign(state.user, settingsData);

    // PERSIST TO STORAGE
    Storage.saveSettings(settingsData);

    showSystemMessage('✅ SETTINGS UPDATED - Saved to Local Browser Storage!');
}

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) handleLogoUpload(file);
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-active');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-active');

    const file = e.dataTransfer.files[0];
    if (file) handleLogoUpload(file);
}

function handleLogoUpload(file) {
    if (!file.type.startsWith('image/')) {
        showSystemMessage('❌ Invalid format: Please upload an image');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        state.user.logo = e.target.result; // Base64 handling

        const preview = document.getElementById('logo-preview');
        const uploadContent = document.querySelector('.upload-content');

        if (preview) {
            preview.src = state.user.logo;
            preview.classList.remove('hidden');
        }
        if (uploadContent) {
            uploadContent.style.display = 'none';
        }
    };
    reader.readAsDataURL(file);
}


// ----------------------------------------------------------------------------
// CLIENT MANAGEMENT
// ----------------------------------------------------------------------------

function openClientModal() {
    const form = elements.forms.client;
    if (form) form.reset();

    const modal = elements.modals.client;
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);
    }
}

function closeClientModal() {
    const modal = elements.modals.client;
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.add('hidden');
            if (elements.forms.client) elements.forms.client.reset();
        }, 300);
    }
}

function handleClientSave(e) {
    e.preventDefault();

    const name = document.getElementById('client-name')?.value?.trim();
    const email = document.getElementById('client-email')?.value?.trim();
    const address = document.getElementById('client-address')?.value?.trim();
    const phone = document.getElementById('client-phone')?.value?.trim();

    if (!name || !email) {
        showSystemMessage('Client name and email are required');
        return;
    }

    const newClient = {
        id: Date.now(),
        name,
        email,
        address: address || '',
        phone: phone || '',
        createdAt: new Date().toISOString()
    };

    state.clients.push(newClient);

    // PERSIST TO STORAGE
    Storage.saveClients(state.clients);

    populateClientSelect();

    // Auto-select
    const clientSelect = document.getElementById('client-select');
    if (clientSelect) clientSelect.value = newClient.id;

    closeClientModal();
    showSystemMessage('Client Saved Locally');
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


// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

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

    const newItem = container.querySelector(`[data-id="${itemId}"]`);
    if (newItem) newItem.style.animation = 'slideIn 0.3s ease-out';
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
    if (container) container.innerHTML = '';
}

function calculateInvoiceTotal() {
    const lineItems = document.querySelectorAll('.line-item');
    let subtotal = 0;

    lineItems.forEach(item => {
        const quantity = parseFloat(item.querySelector('.line-quantity')?.value || 0);
        const price = parseFloat(item.querySelector('.line-price')?.value || 0);
        if (!isNaN(quantity) && !isNaN(price)) subtotal += quantity * price;
    });

    const taxRate = parseFloat(document.getElementById('tax-rate')?.value || 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    updateAmount('subtotal-amount', subtotal);
    updateAmount('tax-amount', taxAmount);
    updateAmount('total-amount', total);

    if (state.currentInvoice) {
        state.currentInvoice.subtotal = subtotal;
        state.currentInvoice.taxRate = taxRate;
        state.currentInvoice.taxAmount = taxAmount;
        state.currentInvoice.total = total;
    }
}

function updateAmount(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = '₹' + val.toFixed(2);
}

function populatePaymentTermsSelect() {
    const select = document.getElementById('payment-terms');
    if (select) {
        select.innerHTML = '';
        state.paymentTermsOptions.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.label;
            select.appendChild(el);
        });
    }
}

function populateTaxRates() {
    const select = document.getElementById('tax-rate');
    if (select) {
        select.innerHTML = '';
        state.taxRates.forEach(rate => {
            const el = document.createElement('option');
            el.value = rate.value;
            el.textContent = rate.label;
            select.appendChild(el);
        });
    }
}

function validateInvoiceForm() {
    // Basic validation
    const container = document.getElementById('line-items-container');
    if (container.children.length === 0) {
        showSystemMessage('Please add at least one line item');
        return false;
    }

    // Check required fields
    const inputs = document.getElementById('invoice-form').querySelectorAll('input[required]');
    for (let input of inputs) {
        if (!input.value) {
            input.focus();
            showSystemMessage('Please fill all required fields');
            return false;
        }
    }

    return true;
}

function collectInvoiceData() {
    if (!state.currentInvoice) return;

    state.currentInvoice.number = document.getElementById('invoice-number').value;
    state.currentInvoice.client = document.getElementById('client-select').value;
    state.currentInvoice.dueDate = document.getElementById('due-date').value;

    state.currentInvoice.lineItems = [];
    document.querySelectorAll('.line-item').forEach(item => {
        state.currentInvoice.lineItems.push({
            description: item.querySelector('.line-description').value,
            quantity: parseFloat(item.querySelector('.line-quantity').value),
            price: parseFloat(item.querySelector('.line-price').value),
            total: parseFloat(item.querySelector('.line-quantity').value) * parseFloat(item.querySelector('.line-price').value)
        });
    });

    calculateInvoiceTotal(); // Ensure totals are sync
}

function showSystemMessage(msg) {
    // Create or use existing message container
    let container = document.getElementById('system-message');
    if (!container) {
        container = document.createElement('div');
        container.id = 'system-message';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: #00f0ff;
            padding: 15px 25px;
            border-left: 4px solid #00f0ff;
            border-radius: 4px;
            z-index: 9999;
            font-family: 'Courier New', monospace;
            animation: slideInRight 0.3s ease-out;
        `;
        document.body.appendChild(container);
    }

    container.textContent = msg;
    container.classList.remove('hidden');

    setTimeout(() => {
        container.classList.add('hidden');
        setTimeout(() => container.remove(), 300);
    }, 3000);
}

function closeAllModals() {
    Object.values(elements.modals).forEach(modal => {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    });
}

// STUBS for missing functions to prevent ReferenceErrors
// ----------------------------------------------------------------------------
// PREVIEW & DOWNLOAD LOGIC
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// PREVIEW & DOWNLOAD LOGIC
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// PREVIEW & DOWNLOAD LOGIC
// ----------------------------------------------------------------------------


function previewInvoice() {
    // 1. Validate Basic Data
    if (!validateInvoiceForm()) return;

    // 2. Collect Data
    collectInvoiceData(); // Updates state.currentInvoice
    const inv = state.currentInvoice;
    const client = state.clients.find(c => c.id == inv.client) || { name: 'Unknown Client', address: '', email: '' }; // Handle unselected client gracefully for preview
    const settings = state.user;

    // 3. specific validation for preview
    if (!inv.lineItems || inv.lineItems.length === 0) {
        showSystemMessage('⚠️ Add at least one line item to preview');
        return;
    }

    // 4. Generate HTML
    const previewContainer = document.getElementById('invoice-preview');
    if (!previewContainer) return;

    const logoHtml = settings.logo ? `<div class="invoice-logo"><img src="${settings.logo}" alt="Company Logo"></div>` : '';

    // DARK BLUE COLOR: #0A0C10 (Matches App Background)
    const darkBlue = '#0A0C10';

    const html = `
        <div class="invoice-box" style="padding: 40px; background: white !important; color: ${darkBlue} !important; font-family: 'Inter', sans-serif;">
            <div class="invoice-header" style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                <div class="company-details">
                    ${logoHtml}
                    <h2 style="margin: 0; color: ${darkBlue} !important; font-weight: 700;">${settings.companyName || ''}</h2>
                    <p style="margin: 5px 0; color: ${darkBlue} !important; font-size: 0.9em; white-space: pre-line;">${settings.companyAddress || ''}</p>
                    <p style="margin: 0; color: ${darkBlue} !important; font-size: 0.9em;">${settings.companyEmail || ''}</p>
                    <p style="margin: 0; color: ${darkBlue} !important; font-size: 0.9em;">${settings.companyPhone || ''}</p>
                </div>
                <div class="invoice-meta" style="text-align: right;">
                    <h1 style="margin: 0; color: ${darkBlue} !important; font-size: 2.5em; font-weight: 900;">INVOICE</h1>
                    <p style="margin: 5px 0; font-weight: 600; color: ${darkBlue} !important;"># ${inv.number}</p>
                    <p style="margin: 0; color: ${darkBlue} !important;">Date: ${inv.createdAt.split('T')[0]}</p>
                    <p style="margin: 0; color: ${darkBlue} !important;">Due: ${inv.dueDate || 'On Receipt'}</p>
                </div>
            </div>

            <div class="client-details" style="margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: ${darkBlue} !important; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px;">Bill To:</h3>
                <h4 style="margin: 0; font-size: 1.2em; font-weight: 600; color: ${darkBlue} !important;">${client.name}</h4>
                <p style="margin: 5px 0; color: ${darkBlue} !important; white-space: pre-line;">${client.address || ''}</p>
                <p style="margin: 0; color: ${darkBlue} !important;">${client.email || ''}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid ${darkBlue}; color: ${darkBlue} !important;">Description</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid ${darkBlue}; color: ${darkBlue} !important;">Qty</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid ${darkBlue}; color: ${darkBlue} !important;">Price</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid ${darkBlue}; color: ${darkBlue} !important;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${inv.lineItems.map(item => `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 12px; color: ${darkBlue} !important;">${item.description}</td>
                        <td style="padding: 12px; text-align: right; color: ${darkBlue} !important;">${item.quantity}</td>
                        <td style="padding: 12px; text-align: right; color: ${darkBlue} !important;">₹${parseFloat(item.price).toFixed(2)}</td>
                        <td style="padding: 12px; text-align: right; font-weight: 600; color: ${darkBlue} !important;">₹${parseFloat(item.total).toFixed(2)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="invoice-totals" style="display: flex; flex-direction: column; align-items: flex-end;">
                <div style="width: 250px;">
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; color: ${darkBlue} !important;">
                        <span>Subtotal:</span>
                        <span>₹${parseFloat(inv.subtotal).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; color: ${darkBlue} !important;">
                        <span>Tax (${inv.taxRate}%):</span>
                        <span>₹${parseFloat(inv.taxAmount).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid ${darkBlue}; margin-top: 10px; font-weight: 700; color: ${darkBlue} !important; font-size: 1.2em;">
                        <span>Total:</span>
                        <span>₹${parseFloat(inv.total).toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div class="invoice-footer" style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; font-size: 0.8em; color: ${darkBlue} !important; text-align: center;">
                <h4 style="margin: 0 0 5px 0; color: ${darkBlue} !important;">Payment Terms</h4>
                <p style="margin: 0 0 10px 0;">${settings.paymentTermsLabel || `Payment due within ${settings.paymentTerms || 30} days`}</p>
                <div style="background: #f8f9fa; padding: 10px; display: inline-block; border-radius: 4px;">
                    <p style="margin: 0;"><strong>Bank:</strong> ${settings.bankName || 'N/A'} | <strong>Account:</strong> ${settings.accountNumber || 'N/A'}</p>
                </div>
                <p style="margin-top: 20px; font-style: italic;">Thank you for your business!</p>
            </div>
        </div>
    `;

    previewContainer.innerHTML = html;

    // 5. Pre-fill Email Body
    const emailBodyInput = document.getElementById('email-body');
    if (emailBodyInput) {
        const currencySymbol = state.user.currency === 'INR' || state.user.currency === '₹' ? '₹' : '$';
        // Force Rupee for now as requested
        const displayCurrency = '₹';

        const emailContent = `Dear ${client.name},\n\nPlease find attached invoice #${inv.number} for ${displayCurrency}${parseFloat(inv.total).toFixed(2)}.\n\nThank you for your business,\n${settings.companyName || 'Alpha User'}`;
        emailBodyInput.value = emailContent;
        // Move email box down slightly as requested
        const emailSection = emailBodyInput.closest('.email-section');
        if (emailSection) {
            emailSection.style.marginTop = '30px';
        }
    }

    // 6. Show Modal
    const modal = document.getElementById('preview-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

async function downloadInvoice() {
    const previewElement = document.querySelector('#invoice-preview .invoice-box');
    if (!previewElement) {
        showSystemMessage('❌ Error: No invoice preview found');
        return;
    }

    const btn = document.getElementById('download-button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="button-text">Generating PDF...</span>';
    btn.disabled = true;

    try {
        const canvas = await html2canvas(previewElement, {
            scale: 2, // Higher resolution
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        const invNum = state.currentInvoice.number || 'invoice';
        pdf.save(`${invNum}.pdf`);
        showSystemMessage('✅ PDF Downloaded');

    } catch (error) {
        console.error('PDF Generation Error:', error);
        showSystemMessage('❌ Error generating PDF: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function sendInvoice() {
    const inv = state.currentInvoice;
    const client = state.clients.find(c => c.id == inv.client);

    if (!client || !client.email) {
        showSystemMessage('⚠️ Client email not found');
        return;
    }

    // Get the pre-filled body from the textarea which the user might have edited
    const emailBodyInput = document.getElementById('email-body');
    const bodyContent = emailBodyInput ? emailBodyInput.value : `Dear ${client.name},\n\nPlease find attached invoice #${inv.number}.`;

    const subject = encodeURIComponent(`Invoice #${inv.number} from ${state.user.companyName}`);
    const body = encodeURIComponent(bodyContent);

    // Open default mail client in new tab/window
    window.open(`mailto:${client.email}?subject=${subject}&body=${body}`, '_blank');

    showSystemMessage('📧 Opening email client...');
}

function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

// ----------------------------------------------------------------------------
// GLOBAL EXPORTS FOR HTML HANDLERS
// ----------------------------------------------------------------------------
window.createNewInvoice = createNewInvoice;
window.saveInvoiceFunc = saveInvoiceFunc;
window.saveSettings = saveSettings;
window.openClientModal = openClientModal;
window.closeClientModal = closeClientModal;
window.previewInvoice = previewInvoice;
window.switchInvoicingView = switchInvoicingView;
window.editInvoice = editInvoice;
window.removeLineItem = removeLineItem;
window.addLineItem = addLineItem;
window.downloadInvoice = downloadInvoice;
window.sendInvoice = sendInvoice;
window.closePreviewModal = closePreviewModal;

