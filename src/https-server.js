const https = require('https');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

class HTTPSServer {
    constructor(config, certificateManager, mappingsManager) {
        this.config = config;
        this.certificateManager = certificateManager;
        this.mappingsManager = mappingsManager;
        this.httpsProxy = httpProxy.createProxyServer({
            changeOrigin: true,
            ws: true,
            timeout: 30000,
            proxyTimeout: 30000
        });

        // Only create HTTPS server if enabled
        this.httpsServer = this.createHTTPSServer();
    }

    createHTTPSServer() {
        // Create the HTTPS server with SNI support
        const server = https.createServer({
            SNICallback: (domain, cb) => {
                console.log(`SNI callback for domain: ${domain}`);
                const ctx = this.certificateManager.createSecureContext(domain);
                if (ctx) {
                    console.log(`Loaded certificate for ${domain}`);
                    cb(null, ctx);
                } else {
                    console.log(`No certificate found for ${domain}`);
                    cb(new Error(`No certificate for domain ${domain}`));
                }
            }
        });
        server.on("keylog", (a) => { console.log("keylog", a); })
        server.on("newSession", (a) => { console.log("newSession", a); })
        server.on("OCSPRequest", (a) => { console.log("OCSPRequest", a); })
        // server.on("resumeSession", (a) => { console.log("resumeSession", a); })
        server.on("secureConnection", (a) => { console.log("secureConnection", a); })
        server.on("tlsClientError", (a) => { console.log("tlsClientError", a); })
        server.on("close", (a) => { console.log("close", a); })
        // server.on("connection", (a) => { console.log("connection", a); })
        server.on("error", (a) => { console.log("error", a); })
        server.on("listening", (a) => { console.log("listening", a); })
        server.on("checkContinue", (a) => { console.log("checkContinue", a); })
        server.on("checkExpectation", (a) => { console.log("checkExpectation", a); })
        server.on("clientError", (a) => { console.log("clientError", a); })
        server.on("connect", (a) => { console.log("connect", a); })
        server.on("request", (a) => { console.log("request", a); })
        server.on("upgrade", (a) => { console.log("upgrade", a); })

        // Handle HTTPS requests
        this.setupRequestHandler(server);

        return server;
    }

    setupRequestHandler(server) {

        server.on('request', (req, res) => {
            const host = req.headers.host;
            console.log({ host })
            if (host) {
                const mappings = this.mappingsManager.getMappings();
                const mapping = mappings.mappings.find(m => m.domain === host);

                if (mapping) {
                    // Proxy to the target application
                    this.httpsProxy.web(req, res, {
                        target: `http://${host}:${mapping.port}`
                    });
                    return;
                }

                // Handle dashboard/API routes for localhost
                if (host === 'localhost' || host === 'localhost:443' || host.startsWith('localhost:')) {
                    this.handleDashboardRequest(req, res);
                    return;
                }
            }

            // Fallback: simple error response
            res.writeHead(404);
            res.end('LAM Dashboard: Use http://localhost or https://localhost');
        });

        // Handle proxy errors
        this.httpsProxy.on('error', (err, req, res) => {
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
                    console.error('HTTPS Proxy error:', err.message);
                    res.status(500).send(this.getErrorHTML('Proxy Error', `
                        An error occurred while connecting to <strong class="domain">${host}</strong>.
                        <br><br>Please check your LAM configuration and try again.
                    `));
                }
            }
        });
    }

    async handleDashboardRequest(req, res) {
        // Handle API routes
        if (req.url.startsWith('/api/')) {
            await this.handleAPIRequest(req, res);
            return;
        }

        // Serve static files for dashboard
        const staticPath = path.join(__dirname, '../public');
        const filePath = req.url === '/' ? path.join(staticPath, 'index.html') : path.join(staticPath, req.url);

        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // File not found, serve index.html for SPA routing
                    fs.readFile(path.join(staticPath, 'index.html'), (err, indexData) => {
                        if (err) {
                            res.writeHead(500);
                            res.end('Internal Server Error');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(indexData);
                        }
                    });
                } else {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            } else {
                // Determine content type based on file extension
                const ext = path.extname(filePath);
                let contentType = 'text/plain';
                if (ext === '.html') contentType = 'text/html';
                else if (ext === '.css') contentType = 'text/css';
                else if (ext === '.js') contentType = 'application/javascript';
                else if (ext === '.png') contentType = 'image/png';
                else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
                else if (ext === '.ico') contentType = 'image/x-icon';
                else if (ext === '.json') contentType = 'application/json';

                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
        });
    }

    async handleAPIRequest(req, res) {
        const mappings = this.mappingsManager.getMappings();

        // Handle different API endpoints
        if (req.method === 'GET' && req.url === '/api/mappings') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(mappings));
        }

        if (req.method === 'GET' && req.url === '/api/version') {
            const pkg = require('../package.json');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ version: pkg.version }));
        }

        if (req.method === 'GET' && req.url.startsWith('/api/servers')) {
            const serverScanner = require('./server-scanner');
            try {
                const includeAll = req.url.includes('all=true');
                const servers = await serverScanner.scanLocalServers(includeAll);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ servers }));
            } catch (error) {
                console.error('Error scanning servers:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Failed to scan local servers' }));
            }
        }

        if (req.method === 'GET' && req.url.startsWith('/api/certificates/')) {
            const domain = req.url.split('/api/certificates/')[1];
            try {
                const cert = this.certificateManager.getCertificateForDomain(domain);
                const keyExists = fs.existsSync(cert.keyPath);
                const certExists = fs.existsSync(cert.certPath);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    domain,
                    exists: keyExists && certExists,
                    keyPath: cert.keyPath,
                    certPath: cert.certPath
                }));
            } catch (error) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Certificate not found' }));
            }
        }

        res.writeHead(405);
        res.end('Method not allowed');
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
                    <div class="logo"><img src="https://localhost/app-icon.png" alt="LAM" style="width: 64px; height: 64px;"></div>
                    <h1>${title}</h1>
                    <p>${content}</p>
                    <a href="https://localhost" class="btn">Go to LAM Dashboard</a>
                </div>
            </body>
            </html>
        `;
    }

    start(port) {
        console.log({ port })
        if (this.httpsServer) {
            console.log(11);
            this.httpsServer.listen(port, () => {
                console.log(`LAM HTTPS server listening on port ${port}`);
                console.log(`Secure dashboard: https://localhost:${port}`);
            });

            this.httpsServer.on('error', (err) => {
                console.error(`HTTPS Server Error: ${err.message}`);
                console.log('HTTPS server requires root privileges on macOS/Linux. Please run with sudo.');
            });
        }
    }

    isEnabled() {
        return !!this.httpsServer;
    }
}

module.exports = HTTPSServer;
