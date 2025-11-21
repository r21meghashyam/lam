// LAM (Localhost Apps Manager) - Main Entry Point
// Modularized architecture for better maintainability

const ConfigManager = require('./src/config');
const DNSServer = require('./src/dns-server');
const HTTPServer = require('./src/http-server');
const HTTPSServer = require('./src/https-server');
const CertificateManager = require('./src/certificate-manager');
const ServerScanner = require('./src/server-scanner');
const MappingsManager = require('./src/mappings-manager').create;

console.log('Starting LAM (Localhost Apps Manager)...');

// Initialize configuration
const config = ConfigManager.loadConfig();

// Initialize mappings manager
const mappingsManager = MappingsManager(config);

// Set up DNS server
const dnsServer = new DNSServer();
dnsServer.setMappings(mappingsManager.getMappings());
dnsServer.start();

// Initialize server scanner
const serverScanner = new ServerScanner();

// Initialize HTTP server
const httpServer = new HTTPServer(config, mappingsManager, serverScanner);
httpServer.start(config.httpPort);

// Initialize HTTPS server (if enabled)
const certificateManager = new CertificateManager(config);
const httpsServer = new HTTPSServer(config, certificateManager, mappingsManager);
if (httpsServer.isEnabled()) {
    httpsServer.start(config.httpsPort);
}

if (config.enableHttps) {
    console.log('HTTPS support enabled with automatic certificate generation');
}
