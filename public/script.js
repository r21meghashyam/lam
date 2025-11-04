// DOM elements
const addMappingForm = document.getElementById('addMappingForm');
const mappingsList = document.getElementById('mappingsList');

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

// Add new mapping
async function addMapping(project, port, https) {
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                project,
                port: parseInt(port),
                https
            })
        });

        const result = await response.json();

        if (response.ok) {
            alert(`Mapping created successfully!\nDomain: ${result.domain}\nURL: ${result.url}`);
            loadMappings(); // Refresh the list
            addMappingForm.reset(); // Clear the form
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error adding mapping:', error);
        alert('Error adding mapping. Please try again.');
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
            alert(`Proxy mode ${result.proxy ? 'enabled' : 'disabled'} for ${domain}`);
            loadMappings(); // Refresh the list
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error toggling proxy mode:', error);
        alert('Error toggling proxy mode. Please try again.');
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
            alert('Mapping removed successfully!');
            loadMappings(); // Refresh the list
        } else {
            const result = await response.json();
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error removing mapping:', error);
        alert('Error removing mapping. Please try again.');
    }
}

// Event listeners
addMappingForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const project = document.getElementById('project').value.trim();
    const port = document.getElementById('port').value;
    const https = document.getElementById('https').checked;

    if (project && port) {
        addMapping(project, port, https);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadMappings();
});
