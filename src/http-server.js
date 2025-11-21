const express = require('express');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

class HTTPServer {
    constructor(config, mappingsManager, serverScanner) {
        this.config = config;
        this.mappingsManager = mappingsManager;
        this.serverScanner = serverScanner;
        this.app = express();
        this.proxy = httpProxy.createProxyServer({
            changeOrigin: true,
            ws: true,
            timeout: 30000,
            proxyTimeout: 30000
        });

        this.setupMiddleware();
        this.setupProxyHandlers();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Increase max listeners to prevent warnings
        this.app.set('maxListeners', 20);
        this.app.use(require('cors')());
        this.app.use(express.json());
    }

    setupRoutes() {
        // API Routes
        this.app.post('/api/register', (req, res) => {
            const { project, port, https = false, tld = 'local' } = req.body;

            if (!project || !port) {
                return res.status(400).json({ error: 'Project name and port are required' });
            }

            const result = this.mappingsManager.createMapping(project, port, https, tld);
            res.json(result);
        });

        this.app.get('/api/mappings', (req, res) => {
            res.json(this.mappingsManager.getMappings());
        });

        this.app.delete('/api/mappings/:domain', (req, res) => {
            const result = this.mappingsManager.removeMapping(req.params.domain);
            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        });

        this.app.get('/api/servers', async (req, res) => {
            try {
                const includeAll = req.query.all === 'true';
                const servers = await this.serverScanner.scanLocalServers(includeAll);
                res.json({ servers });
            } catch (error) {
                console.error('Error scanning servers:', error);
                res.status(500).json({ error: 'Failed to scan local servers' });
            }
        });

        this.app.delete('/api/servers/:pid', async (req, res) => {
            const pid = parseInt(req.params.pid);

            if (!pid || isNaN(pid)) {
                return res.status(400).json({ error: 'Invalid PID' });
            }

            try {
                await this.serverScanner.killProcess(pid);
                res.json({ success: true, pid });
            } catch (error) {
                console.error('Error killing process:', error);
                res.status(500).json({ error: 'Failed to kill process' });
            }
        });

        this.app.get('/api/version', (req, res) => {
            const pkg = require('../package.json');
            res.json({ version: pkg.version });
        });

        // Serve static files for the web dashboard
        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    setupProxyHandlers() {
        // Handle proxy errors
        this.proxy.on('error', (err, req, res) => {
            if (!res.headersSent) {
                const host = req.headers.host;
                const mappings = this.mappingsManager.getMappings();
                const mapping = mappings.mappings.find(m => m.domain === host);

                if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'].includes(err.code)) {
                    res.status(502).send(this.getErrorHTML('Server Not Reachable', `
                        The domain <strong class="domain">${host}</strong> is configured in LAM but the target server is not running.
                        <br><br>
                        <strong class="port">Target: localhost:${mapping ? mapping.port : 'unknown'}</strong>
                        <br><br>Please start your development server and try again.
                    `));
                } else {
                    console.error('Proxy error:', err.message);
                    res.status(500).send(this.getErrorHTML('Proxy Error', `
                        An error occurred while connecting to <strong class="domain">${host}</strong>.
                        <br><br>Please check your LAM configuration and try again.
                    `));
                }
            }
        });

        // Handle proxy mode for all configured domains
        this.app.use((req, res, next) => {
            const host = req.headers.host;
            if (host) {
                const mappings = this.mappingsManager.getMappings();
                const mapping = mappings.mappings.find(m => m.domain === host);
                if (mapping) {
                    this.proxy.web(req, res, {
                        target: `${mapping.https ? 'https' : 'http'}://${host}:${mapping.port}`
                    });
                    return;
                }
            }
            next();
        });
    }

    getErrorHTML(title, content) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>LAM - ${title}</title>
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
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo"><img src="http://localhost/app-icon.png" alt="LAM" style="width: 64px; height: 64px;"></div>
                    <h1>${title}</h1>
                    <p>${content}</p>
                    <a href="http://localhost" class="btn">Go to LAM Dashboard</a>
                </div>
            </body>
            </html>
        `;
    }

    start(port) {
        this.app.listen(port, () => {
            console.log(`LAM (Localhost Apps Manager) running on port ${port}`);
            console.log(`Web dashboard: http://localhost:${port}`);
            console.log(`API endpoint: http://localhost:${port}/api/register`);
        });
    }

    getExpressApp() {
        return this.app;
    }
}

module.exports = HTTPServer;
