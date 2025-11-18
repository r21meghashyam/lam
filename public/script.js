// DOM elements
const addMappingForm = document.getElementById('addMappingForm');
const mappingsList = document.getElementById('mappingsList');
const serversList = document.getElementById('serversList');
const refreshServersBtn = document.getElementById('refreshServers');
const toastContainer = document.getElementById('toastContainer');

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
        const response = await fetch('/api/mappings');
        const data = await response.json();

        if (data.mappings && data.mappings.length > 0) {
            displayMappings(data.mappings);
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

function displayMappings(mappings) {
    mappingsList.innerHTML = '';

    mappings.forEach(mapping => {
        const mappingItem = document.createElement('div');
        mappingItem.className = 'mapping-item';

        const mappingInfo = document.createElement('div');
        mappingInfo.className = 'mapping-info';

        const title = document.createElement('h3');
        title.textContent = mapping.domain;

        const details = document.createElement('p');
        details.textContent = `Port: ${mapping.port} | Protocol: ${mapping.https ? 'HTTPS' : 'HTTP'} | Mode: ${mapping.proxy ? 'Proxy' : 'Redirect'}`;

        mappingInfo.appendChild(title);
        mappingInfo.appendChild(details);

        const mappingActions = document.createElement('div');
        mappingActions.className = 'mapping-actions';

        const visitBtn = document.createElement('button');
        visitBtn.className = 'btn btn-primary';
        visitBtn.textContent = 'Visit';
        visitBtn.onclick = () => {
            if (mapping.proxy) {
                // For proxy mode, visit the .local domain (proxy handles routing)
                window.open(`http://${mapping.domain}`, '_blank');
            } else {
                // For redirect mode, visit the final localhost:port URL
                window.open(`http://${mapping.domain}:${mapping.port}`, '_blank');
            }
        };

        const proxyBtn = document.createElement('button');
        proxyBtn.className = `btn ${mapping.proxy ? 'btn-warning' : 'btn-secondary'}`;
        proxyBtn.textContent = mapping.proxy ? 'Proxy Mode' : 'Redirect Mode';
        proxyBtn.onclick = () => toggleProxyMode(mapping.domain);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Remove';
        deleteBtn.onclick = () => removeMapping(mapping.domain);

        mappingActions.appendChild(visitBtn);
        mappingActions.appendChild(proxyBtn);
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
            <th>Status</th>
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
        processCell.textContent = server.process || 'Unknown';
        processCell.title = `PID: ${server.pid}, User: ${server.user}`;

        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${server.status}`;
        statusBadge.textContent = server.status.toUpperCase();
        statusCell.appendChild(statusBadge);

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
        mapBtn.onclick = () => quickMapServer(server.port);
        actionsDiv.appendChild(mapBtn);

        actionsCell.appendChild(actionsDiv);

        row.appendChild(portCell);
        row.appendChild(processCell);
        row.appendChild(statusCell);
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

// Toggle proxy mode
async function toggleProxyMode(domain) {
    try {
        const response = await fetch(`/api/mappings/${domain}/toggle-proxy`, {
            method: 'PATCH'
        });

        const result = await response.json();

        if (response.ok) {
            showToast(`Proxy mode ${result.proxy ? 'enabled' : 'disabled'} for ${domain}`, 'success');
            loadMappings(); // Refresh the list
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error toggling proxy mode:', error);
        showToast('Error toggling proxy mode. Please try again.', 'error');
    }
}

// Quick map server
async function quickMapServer(port) {
    const project = prompt(`Enter a project name for port ${port}:`, `app${port}`);
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
                port: parseInt(port),
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

// Remove mapping
async function removeMapping(domain) {
    if (!confirm(`Are you sure you want to remove the mapping for ${domain}?`)) {
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
});
