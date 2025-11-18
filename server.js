const express = require('express');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const net = require('net');

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

// Scan for running local servers
const scanLocalServers = () => {
    return new Promise((resolve) => {
        const { exec } = require('child_process');

        // Use lsof to get listening processes
        exec('lsof -i -P -n | grep LISTEN', (error, stdout, stderr) => {
            const portMap = new Map();

            if (error) {
                console.error('Error scanning servers:', error);
                resolve([]);
                return;
            }

            const lines = stdout.trim().split('\n').filter(line => line.trim());

            lines.forEach(line => {
                // Parse lsof output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 9) {
                    const command = parts[0];
                    const pid = parts[1];
                    const user = parts[2];
                    const name = parts[8]; // The address:port is at index 8

                    // Parse address:port (e.g., "127.0.0.1:3000" or "*:3000" or "[::1]:3000")
                    let host, portStr;
                    if (name.startsWith('[') && name.includes(']:')) {
                        // IPv6 format: [::1]:port
                        const match = name.match(/\[([^\]]+)\]:(\d+)/);
                        if (match) {
                            host = match[1];
                            portStr = match[2];
                        }
                    } else {
                        // IPv4 format: host:port
                        const addressParts = name.split(':');
                        if (addressParts.length === 2) {
                            host = addressParts[0];
                            portStr = addressParts[1];
                        }
                    }

                    const port = parseInt(portStr);

                    // Only include localhost/127.0.0.1/::1 servers
                    if ((host === '127.0.0.1' || host === '*' || host === 'localhost' || host === '::1') && !isNaN(port)) {
                        if (!portMap.has(port)) {
                            portMap.set(port, {
                                port,
                                status: 'open',
                                url: `http://localhost:${port}`,
                                process: command,
                                pid: pid,
                                user: user,
                                mapped: mappings.mappings.some(m => m.port === port)
                            });
                        }
                        // If we already have this port, prefer the one with more specific host binding
                        else if (host === '127.0.0.1' || host === 'localhost') {
                            portMap.set(port, {
                                port,
                                status: 'open',
                                url: `http://localhost:${port}`,
                                process: command,
                                pid: pid,
                                user: user,
                                mapped: mappings.mappings.some(m => m.port === port)
                            });
                        }
                    }
                }
            });

            // Convert map to array, filter out self (port 80) and already mapped servers, then sort by port number
            const results = Array.from(portMap.values())
                .filter(server => server.port !== 80 && !server.mapped)
                .sort((a, b) => a.port - b.port);
            resolve(results);
        });
    });
};

// API Routes
app.post('/api/register', (req, res) => {
    const { project, port, https = false, proxy = false, tld = 'local' } = req.body;

    if (!project || !port) {
        return res.status(400).json({ error: 'Project name and port are required' });
    }

    const domain = `${project}.${tld}`;

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

app.get('/api/servers', async (req, res) => {
    try {
        const servers = await scanLocalServers();
        res.json({ servers });
    } catch (error) {
        console.error('Error scanning servers:', error);
        res.status(500).json({ error: 'Failed to scan local servers' });
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
        const host = req.headers.host;
        const mapping = mappings.mappings.find(m => m.domain === host);

        if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'].includes(err.code)) {
            res.status(502).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>LAM - Server Not Reachable</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                        .container { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 2rem; max-width: 500px; text-align: center; }
                        .logo { margin-bottom: 1rem; }
                        h1 { color: #333; margin-bottom: 1rem; }
                        p { color: #666; margin-bottom: 2rem; line-height: 1.6; }
                        .domain { font-family: monospace; background: #f8f8f8; padding: 0.5rem; border-radius: 4px; margin: 1rem 0; }
                        .port { font-family: monospace; background: #fff3cd; color: #856404; padding: 0.5rem; border-radius: 4px; margin: 1rem 0; }
                        .btn { display: inline-block; background: #007bff; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 4px; margin: 0.5rem; }
                        .btn:hover { background: #0056b3; }
                        .btn-secondary { background: #6c757d; }
                        .btn-secondary:hover { background: #545b62; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="logo"><img src="http://locahost/app-icon.jpg" alt="LAM" style="width: 64px; height: 64px;"></div>
                        <h1>Server Not Reachable</h1>
                        <p>The domain <strong class="domain">${host}</strong> is configured in LAM but the target server is not running.</p>
                        <p class="port">Target: localhost:${mapping ? mapping.port : 'unknown'}</p>
                        <p>Please start your development server and try again.</p>
                        <a href="http://localhost" class="btn">Go to LAM Dashboard</a>
                        <button onclick="window.location.reload()" class="btn btn-secondary">Try Again</button>
                    </div>
                </body>
                </html>
            `);
        } else {
            console.error('Proxy error:', err.message);
            res.status(500).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>LAM - Proxy Error</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                        .container { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 2rem; max-width: 500px; text-align: center; }
                        .logo { margin-bottom: 1rem; }
                        h1 { color: #333; margin-bottom: 1rem; }
                        p { color: #666; margin-bottom: 2rem; line-height: 1.6; }
                        .domain { font-family: monospace; background: #f8f8f8; padding: 0.5rem; border-radius: 4px; margin: 1rem 0; }
                        .btn { display: inline-block; background: #007bff; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 4px; margin: 0.5rem; }
                        .btn:hover { background: #0056b3; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="logo"><img src="http://locahost/app-icon.jpg" alt="LAM" style="width: 64px; height: 64px;"></div>
                        <h1>Proxy Error</h1>
                        <p>An error occurred while connecting to <strong class="domain">${host}</strong>.</p>
                        <p>Please check your LAM configuration and try again.</p>
                        <a href="/" class="btn">Go to LAM Dashboard</a>
                    </div>
                </body>
                </html>
            `);
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
