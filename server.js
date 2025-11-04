const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// Increase max listeners to prevent warnings
app.set('maxListeners', 20);

app.use(cors());
app.use(express.json());

// Load configuration
let config;
const configPath = path.join(require('os').homedir(), '.lam', 'config.json');
try {
    if (!fs.existsSync(configPath)) {
        // Create default config
        const defaultConfig = {
            httpPort: 80,
            httpsPort: 443,
            storagePath: path.join(require('os').homedir(), '.lam', 'mappings.json'),
            certsPath: path.join(require('os').homedir(), '.lam', 'certs'),
            hostsFile: "/etc/hosts",
            enableHttps: false,
            autoUpdateHosts: true,
            enableWebSocketProxy: false
        };
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading config.json:', error);
    process.exit(1);
}

// Load mappings
let mappings = { mappings: [] };
const loadMappings = () => {
    try {
        if (!fs.existsSync(path.dirname(config.storagePath))) {
            fs.mkdirSync(path.dirname(config.storagePath), { recursive: true });
        }
        if (fs.existsSync(config.storagePath)) {
            mappings = JSON.parse(fs.readFileSync(config.storagePath, 'utf8'));
        } else {
            mappings = { mappings: [] };
        }
    } catch (error) {
        console.error('Error loading mappings:', error);
    }
};

const saveMappings = () => {
    try {
        fs.writeFileSync(config.storagePath, JSON.stringify(mappings, null, 2));
    } catch (error) {
        console.error('Error saving mappings:', error);
    }
};

loadMappings();

// Update hosts file
const updateHostsFile = (domain, port, action = 'add') => {
    if (!config.autoUpdateHosts) return;

    try {
        const hostsPath = config.hostsFile;
        let hostsContent = '';

        if (fs.existsSync(hostsPath)) {
            hostsContent = fs.readFileSync(hostsPath, 'utf8');
        }

        const entry = `127.0.0.1 ${domain}`;
        const lines = hostsContent.split('\n');

        if (action === 'add') {
            // Check if entry already exists
            const exists = lines.some(line => line.trim() === entry);
            if (!exists) {
                lines.push(entry);
            }
        } else if (action === 'remove') {
            // Remove the entry
            const filteredLines = lines.filter(line => line.trim() !== entry);
            hostsContent = filteredLines.join('\n');
            fs.writeFileSync(hostsPath, hostsContent);
            return;
        }

        fs.writeFileSync(hostsPath, lines.join('\n'));
    } catch (error) {
        console.error('Error updating hosts file:', error);
        console.log('You may need to run with elevated privileges or update hosts manually');
    }
};

// API Routes
app.post('/api/register', (req, res) => {
    const { project, port, https = false, proxy = false } = req.body;

    if (!project || !port) {
        return res.status(400).json({ error: 'Project name and port are required' });
    }

    const domain = `${project}.local`;

    // Check if mapping already exists
    const existingIndex = mappings.mappings.findIndex(m => m.domain === domain);
    if (existingIndex >= 0) {
        mappings.mappings[existingIndex] = { domain, port, https, proxy };
    } else {
        mappings.mappings.push({ domain, port, https, proxy });
    }

    saveMappings();
    updateHostsFile(domain, port, 'add');

    res.json({
        domain,
        url: https && config.enableHttps ? `https://${domain}` : `http://${domain}`,
        port,
        https: https && config.enableHttps,
        proxy
    });
});

app.get('/api/mappings', (req, res) => {
    res.json(mappings);
});

app.delete('/api/mappings/:domain', (req, res) => {
    const domain = req.params.domain;
    const index = mappings.mappings.findIndex(m => m.domain === domain);

    if (index >= 0) {
        const mapping = mappings.mappings[index];
        mappings.mappings.splice(index, 1);
        saveMappings();
        updateHostsFile(domain, mapping.port, 'remove');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Mapping not found' });
    }
});

app.patch('/api/mappings/:domain/toggle-proxy', (req, res) => {
    const domain = req.params.domain;
    const index = mappings.mappings.findIndex(m => m.domain === domain);

    if (index >= 0) {
        mappings.mappings[index].proxy = !mappings.mappings[index].proxy;
        saveMappings();
        res.json({
            domain,
            proxy: mappings.mappings[index].proxy
        });
    } else {
        res.status(404).json({ error: 'Mapping not found' });
    }
});

// Create proxy server for WebSocket and HTTP proxying
const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    ws: true,
    timeout: 30000,
    proxyTimeout: 30000
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
    if (!res.headersSent) {
        if (err.code === 'ECONNREFUSED') {
            res.status(502).json({
                error: 'Proxy Error',
                message: `Unable to connect to target server. Make sure the development server is running.`,
                domain: req.headers.host
            });
        } else {
            console.error('Proxy error:', err.message);
            res.status(500).json({
                error: 'Proxy Error',
                message: 'Internal proxy error',
                domain: req.headers.host
            });
        }
    }
});

// Handle both redirect and proxy modes
app.use((req, res, next) => {
    const host = req.headers.host;
    if (host && host.endsWith('.local')) {
        const mapping = mappings.mappings.find(m => m.domain === host);
        if (mapping) {
            if (mapping.proxy) {
                // Use proxy mode with WebSocket support
                proxy.web(req, res, {
                    target: `http://127.0.0.1:${mapping.port}`
                });
                return;
            } else {
                // Use redirect mode (default)
                const targetUrl = `http://${host}:${mapping.port}${req.url}`;
                res.redirect(302, targetUrl);
                return;
            }
        }
    }
    next();
});

// Serve static files for the web dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Start server
const PORT = config.httpPort || 8080;
app.listen(PORT, () => {
    console.log(`LAM (Localhost Apps Manager) running on port ${PORT}`);
    console.log(`Web dashboard: http://localhost:${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api/register`);
});

module.exports = app;
