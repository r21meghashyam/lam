// DOM elements
const addMappingForm = document.getElementById('addMappingForm');
const mappingsList = document.getElementById('mappingsList');
const serversList = document.getElementById('serversList');
const refreshServersBtn = document.getElementById('refreshServers');
const toastContainer = document.getElementById('toastContainer');

// Global state for server statuses
let allServersStatus = [];

// Toast notification function
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button class="close-btn">×</button>
    `;

    toastContainer.appendChild(toast);

    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);

    // Auto dismiss after 5 seconds
    const dismissTimeout = setTimeout(() => dismissToast(toast), 5000);

    // Close on click
    const closeBtn = toast.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        clearTimeout(dismissTimeout);
        dismissToast(toast);
    });
}

function dismissToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// Check for updates
async function checkForUpdates() {
    try {
        const [currentRes, latestRes] = await Promise.all([
            fetch('/api/version'),
            fetch('https://registry.npmjs.org/lam-cli/latest')
        ]);

        const current = await currentRes.json();
        const latest = await latestRes.json();

        const currentVer = current.version.split('.').map(Number);
        const latestVer = latest.version.split('.').map(Number);

        const isNewer = latestVer.some((part, i) => part > (currentVer[i] || 0)) ||
            latestVer.length > currentVer.length;

        if (isNewer) {
            showUpdateBanner(latest.version);
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
        // Silently fail - don't show error for update check
    }
}

function showUpdateBanner(version) {
    document.getElementById('latestVersion').textContent = version;
    document.getElementById('updateBanner').style.display = 'block';
}

function hideUpdateBanner() {
    document.getElementById('updateBanner').style.display = 'none';
}

// Load and display mappings
async function loadMappings() {
    try {
        // Load both mappings and all server statuses
        const [mappingsResponse, serversResponse] = await Promise.all([
            fetch('/api/mappings'),
            fetch('/api/servers?all=true')
        ]);

        const mappingsData = await mappingsResponse.json();
        const serversData = await serversResponse.json();

        // Update global server status
        allServersStatus = serversData.servers;

        if (mappingsData.mappings && mappingsData.mappings.length > 0) {
            displayMappings(mappingsData.mappings);
        } else {
            displayEmptyState();
        }
    } catch (error) {
        console.error('Error loading mappings:', error);
        displayEmptyState();
    }
}

// Load and display detected servers
async function loadServers() {
    try {
        serversList.innerHTML = '<div class="loading">Scanning for servers...</div>';
        const response = await fetch('/api/servers');
        const data = await response.json();

        if (data.servers && data.servers.length > 0) {
            displayServers(data.servers);
        } else {
            displayEmptyServersState();
        }
    } catch (error) {
        console.error('Error loading servers:', error);
        displayEmptyServersState();
    }
}

async function getFaviconUrl(domain, imgElement) {
    try {
        const response = await fetch(domain);
        if (response.ok) {
            const parser = new DOMParser();
            const text = await response.text();
            const doc = parser.parseFromString(text, 'text/html');
            const iconLink = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
            if (iconLink) {
                let iconUrl = iconLink.getAttribute('href');
                // Handle relative URLs
                if (iconUrl && !iconUrl.startsWith('http')) {
                    const url = new URL(domain);
                    iconUrl = url.origin + (iconUrl.startsWith('/') ? iconUrl : '/' + iconUrl);
                }
                imgElement.src = iconUrl;
            }
            else {
                imgElement.src = `${domain}/favicon.ico`; // Fallback to local favicon
            }

        }
        else {
            imgElement.src = `${domain}/favicon.ico`; // Fallback to local favicon
        }
        imgElement.style.display = 'inline';
    } catch (error) {
        imgElement.src = `${domain}/favicon.ico`;
        imgElement.style.display = 'inline';
    }
}


function displayMappings(mappings) {
    mappingsList.innerHTML = '';

    mappings.forEach(mapping => {
        const mappingItem = document.createElement('div');
        mappingItem.className = 'mapping-item';

        const mappingInfo = document.createElement('div');
        mappingInfo.className = 'mapping-info';

        const title = document.createElement('h3');
        const img = document.createElement('img');
        const domainUrl = `${mapping.https ? 'https' : 'http'}://${mapping.domain}`;
        img.classList.add('favicon');
        img.onerror = () => {
            img.style.display = 'none';
        };
        getFaviconUrl(domainUrl, img);
        title.appendChild(img);
        title.appendChild(document.createTextNode(mapping.domain));

        // Find if server is running on this port
        const serverStatus = allServersStatus.find(s => s.port === mapping.port);
        const isRunning = serverStatus && serverStatus.status === 'open';

        const details = document.createElement('p');
        details.innerHTML = `Port: <strong>${mapping.port}</strong> | Status: <strong>${isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}</strong> | Protocol: <strong>${mapping.https ? '🔒 HTTPS' : '🌐 HTTP'}</strong>`;

        mappingInfo.appendChild(title);
        mappingInfo.appendChild(details);

        const mappingActions = document.createElement('div');
        mappingActions.className = 'mapping-actions';

        const visitBtn = document.createElement('button');
        visitBtn.className = 'btn btn-primary';
        visitBtn.textContent = '🌐 Visit';
        visitBtn.onclick = () => {
            window.open(`${mapping.https ? 'https' : 'http'}://${mapping.domain}`, '_blank');
        };

        // Certificate management buttons
        const certBtn = document.createElement('button');
        certBtn.className = 'btn btn-secondary btn-small';
        certBtn.textContent = '🔐 SSL Cert';
        certBtn.onclick = () => manageCertificate(mapping.domain);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = '🗑️ Remove';
        deleteBtn.onclick = () => removeMapping(mapping.domain);

        mappingActions.appendChild(visitBtn);
        mappingActions.appendChild(certBtn);

        // Add kill button if server is running
        if (isRunning) {
            const killBtn = document.createElement('button');
            killBtn.className = 'btn btn-warning btn-small';
            killBtn.textContent = '🔪 Kill Server';
            killBtn.onclick = () => killServer(serverStatus.pid, serverStatus.process, serverStatus.port);
            mappingActions.appendChild(killBtn);
        }

        mappingActions.appendChild(deleteBtn);

        mappingItem.appendChild(mappingInfo);
        mappingItem.appendChild(mappingActions);

        mappingsList.appendChild(mappingItem);
    });
}

function displayEmptyState() {
    mappingsList.innerHTML = `
        <div class="empty-state">
            <p>No mappings configured yet</p>
            <small>Add your first project above to get started</small>
        </div>
    `;
}

function displayServers(servers) {
    serversList.innerHTML = '';

    // Create table
    const table = document.createElement('table');
    table.className = 'servers-table';

    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Port</th>
            <th>Process</th>
            <th>URL</th>
            <th>Actions</th>
        </tr>
    `;
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement('tbody');

    servers.forEach(server => {
        const row = document.createElement('tr');

        const portCell = document.createElement('td');
        portCell.textContent = server.port;

        const processCell = document.createElement('td');
        const img = document.createElement('img');
        img.classList.add('favicon');
        img.onerror = () => {
            img.style.display = 'none';
        };
        getFaviconUrl(server.url, img);
        processCell.appendChild(img);
        processCell.appendChild(document.createTextNode(server.process || 'Unknown'));
        processCell.title = `PID: ${server.pid}, User: ${server.user}`;

        const urlCell = document.createElement('td');
        const urlLink = document.createElement('a');
        urlLink.href = server.url;
        urlLink.target = '_blank';
        urlLink.textContent = server.url;
        urlCell.appendChild(urlLink);

        const actionsCell = document.createElement('td');
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'server-actions';

        const mapBtn = document.createElement('button');
        mapBtn.className = 'btn btn-primary btn-small';
        mapBtn.textContent = 'Map';
        mapBtn.onclick = () => quickMapServer(server);
        actionsDiv.appendChild(mapBtn);

        const killBtn = document.createElement('button');
        killBtn.className = 'btn btn-danger btn-small';
        killBtn.textContent = 'Kill';
        killBtn.onclick = () => killServer(server.pid, server.process, server.port);
        actionsDiv.appendChild(killBtn);

        actionsCell.appendChild(actionsDiv);

        row.appendChild(portCell);
        row.appendChild(processCell);
        row.appendChild(urlCell);
        row.appendChild(actionsCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    serversList.appendChild(table);
}

function displayEmptyServersState() {
    serversList.innerHTML = `
        <div class="empty-state">
            <p>No unmapped servers detected</p>
            <small>All running servers are already mapped, or no development servers are currently running</small>
        </div>
    `;
}

// Add new mapping
async function addMapping(project, tld, port, https) {
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                project,
                port: parseInt(port),
                https,
                tld
            })
        });

        const result = await response.json();

        if (response.ok) {
            showToast(`Mapping created successfully!\nDomain: ${result.domain}\nURL: ${result.url}`, 'success');
            loadMappings(); // Refresh the list
            addMappingForm.reset(); // Clear the form
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error adding mapping:', error);
        showToast('Error adding mapping. Please try again.', 'error');
    }
}

// Kill server process
async function killServer(pid, process, port) {
    const confirmed = await customConfirm(`Are you sure you want to kill the process "${process}" on port ${port}?`);
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/servers/${pid}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast(`Process ${process} (PID: ${pid}) killed successfully!`, 'success');
            // Refresh both lists since server status may change
            loadMappings();
            loadServers();
        } else {
            const error = await response.json();
            showToast(`Failed to kill process: ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Error killing process:', error);
        showToast('Error killing process. Please try again.', 'error');
    }
}

// Quick map server
async function quickMapServer(server) {
    const project = await customPrompt(`Enter a project name for port ${server.port}:`, `${server.process || `app-` + server.port}`, `e.g., myproject, api, frontend`);
    if (!project || !project.trim()) {
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                project: project.trim(),
                port: parseInt(server.port),
                https: false,
                tld: 'local'
            })
        });

        const result = await response.json();

        if (response.ok) {
            showToast(`Mapping created successfully!\nDomain: ${result.domain}\nURL: ${result.url}`, 'success');
            loadMappings(); // Refresh mappings
            loadServers(); // Refresh servers to show updated mapped status
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error creating mapping:', error);
        showToast('Error creating mapping. Please try again.', 'error');
    }
}

// Certificate management
async function manageCertificate(domain) {
    try {
        // Check if certificate exists
        const certResponse = await fetch(`/api/certificates/${domain}`);
        const certData = await certResponse.json();

        if (certData.exists) {
            // Certificate exists, offer to regenerate or delete
            const action = await customPrompt(
                `Certificate exists for ${domain}. Enter 'delete' to remove it, or any other text to regenerate:`,
                'regenerate',
                'Type "delete" or leave as "regenerate"'
            );

            if (action === 'delete' || action === '"delete"') {
                // Delete certificate
                const confirmed = await customConfirm(`Delete SSL certificate for ${domain}?`);
                if (!confirmed) return;

                try {
                    const deleteResponse = await fetch(`/api/certificates/${domain}`, {
                        method: 'DELETE'
                    });

                    if (deleteResponse.ok) {
                        showToast(`Certificate deleted for ${domain}!`, 'success');
                        loadMappings(); // Refresh to update UI
                    } else {
                        const error = await deleteResponse.json();
                        showToast(`Failed to delete certificate: ${error.error}`, 'error');
                    }
                } catch (error) {
                    console.error('Error deleting certificate:', error);
                    showToast('Error deleting certificate.', 'error');
                }
            } else {
                // Regenerate certificate (delete and create new)
                const confirmed = await customConfirm(`Regenerate SSL certificate for ${domain}?`);
                if (!confirmed) return;

                try {
                    const deleteResponse = await fetch(`/api/certificates/${domain}`, {
                        method: 'DELETE'
                    });

                    if (deleteResponse.ok) {
                        const generateResponse = await fetch(`/api/certificates/${domain}`, {
                            method: 'POST'
                        });

                        if (generateResponse.ok) {
                            showToast(`Certificate regenerated for ${domain}!`, 'success');
                            loadMappings(); // Refresh to update UI
                        } else {
                            const error = await generateResponse.json();
                            showToast(`Failed to regenerate certificate: ${error.error}`, 'error');
                        }
                    }
                } catch (error) {
                    console.error('Error regenerating certificate:', error);
                    showToast('Error regenerating certificate.', 'error');
                }
            }
        } else {
            // Certificate doesn't exist, offer to create
            const confirmed = await customConfirm(`Create SSL certificate for ${domain}?`);
            if (!confirmed) return;

            try {
                const response = await fetch(`/api/certificates/${domain}`, {
                    method: 'POST'
                });

                if (response.ok) {
                    showToast(`Certificate created for ${domain}!`, 'success');
                    loadMappings(); // Refresh to update UI
                } else {
                    const error = await response.json();
                    showToast(`Failed to create certificate: ${error.error}`, 'error');
                }
            } catch (error) {
                console.error('Error creating certificate:', error);
                showToast('Error creating certificate.', 'error');
            }
        }
    } catch (error) {
        console.error('Error checking certificate status:', error);
        // If we can't check, try to generate
        const confirmed = await customConfirm(`Unable to check certificate status. Create SSL certificate for ${domain}?`);
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/certificates/${domain}`, {
                method: 'POST'
            });

            if (response.ok) {
                showToast(`Certificate created for ${domain}!`, 'success');
                loadMappings();
            } else {
                const error = await response.json();
                showToast(`Failed to create certificate: ${error.error}`, 'error');
            }
        } catch (error) {
            console.error('Error creating certificate:', error);
            showToast('Error creating certificate.', 'error');
        }
    }
}

// Remove mapping
async function removeMapping(domain) {
    const confirmed = await customConfirm(`Are you sure you want to remove the mapping for ${domain}?`);
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/mappings/${domain}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Mapping removed successfully!', 'success');
            loadMappings(); // Refresh the list
            loadServers(); // Refresh servers to show updated mapped status
        } else {
            const result = await response.json();
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error removing mapping:', error);
        showToast('Error removing mapping. Please try again.', 'error');
    }
}

// Modal Dialog Management
let modalResolve = null;
let modalReject = null;

function showModal(title, message, inputValue = null, inputPlaceholder = null) {
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalInput = document.getElementById('modalInput');
    const modalClose = document.getElementById('modalClose');
    const modalCancel = document.getElementById('modalCancel');
    const modalConfirm = document.getElementById('modalConfirm');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    if (inputValue !== null) {
        modalInput.style.display = 'block';
        modalInput.value = inputValue;
        modalInput.placeholder = inputPlaceholder || '';
        modalInput.focus();
        modalConfirm.textContent = 'OK';
    } else {
        modalInput.style.display = 'none';
        modalConfirm.textContent = 'Confirm';
    }

    modalOverlay.classList.add('show');

    return new Promise((resolve, reject) => {
        modalResolve = resolve;
        modalReject = reject;

        const closeModal = () => {
            modalOverlay.classList.remove('show');
            modalResolve = null;
            modalReject = null;
        };

        const handleConfirm = () => {
            const result = inputValue !== null ? modalInput.value.trim() : true;
            closeModal();
            resolve(result);
        };

        const handleCancel = () => {
            closeModal();
            if (inputValue !== null) {
                resolve(null);
            } else {
                resolve(false);
            }
        };

        modalConfirm.onclick = handleConfirm;
        modalCancel.onclick = handleCancel;
        modalClose.onclick = handleCancel;

        // Handle Enter key for confirm
        if (inputValue !== null) {
            modalInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    handleConfirm();
                }
            };
        }

        // Handle Escape key for cancel
        document.onkeydown = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };
    });
}

// Replacement functions for browser prompts
function customPrompt(message, defaultValue = '', placeholder = '') {
    return showModal('Input Required', message, defaultValue, placeholder);
}

function customConfirm(message) {
    return showModal('Confirm Action', message);
}

// Theme management
function getStoredTheme() {
    return localStorage.getItem('lam-theme') || 'light';
}

function setStoredTheme(theme) {
    localStorage.setItem('lam-theme', theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        const sunIcon = themeBtn.querySelector('.sun-icon');
        const moonIcon = themeBtn.querySelector('.moon-icon');

        if (theme === 'dark') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'inline';
            themeBtn.title = 'Switch to light theme';
        } else {
            sunIcon.style.display = 'inline';
            moonIcon.style.display = 'none';
            themeBtn.title = 'Switch to dark theme';
        }
    }
}

function toggleTheme() {
    const currentTheme = getStoredTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setStoredTheme(newTheme);
    applyTheme(newTheme);
}

// Event listeners
addMappingForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const project = document.getElementById('project').value.trim();
    const tld = document.getElementById('tld').value.trim();
    const port = document.getElementById('port').value;
    const https = document.getElementById('https').checked;

    if (project && tld && port) {
        addMapping(project, tld, port, https);
    }
});

refreshServersBtn.addEventListener('click', () => {
    loadServers();
});

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme
    applyTheme(getStoredTheme());

    checkForUpdates();
    loadMappings();
    loadServers();

    // Banner close button
    document.getElementById('closeBanner').addEventListener('click', () => {
        hideUpdateBanner();
    });

    // Make update link scroll to console or copy command
    document.getElementById('updateLink').addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText('npm install -g lam-cli@latest').then(() => {
            showToast('Update command copied to clipboard!', 'success');
        });
    });

    // Theme toggle button
    document.getElementById('themeToggle').addEventListener('click', () => {
        toggleTheme();
        showToast(`Switched to ${getStoredTheme() === 'light' ? 'light' : 'dark'} theme!`, 'info');
    });
});
