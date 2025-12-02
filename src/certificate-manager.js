const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

class CertificateManager {
    constructor(config, mappingsManager) {
        this.config = config;
        this.mappingsManager = mappingsManager;
    }

    generateCertificateForDomain(domain) {
        try {
            console.log(`Generating SSL certificate for ${domain}...`);

            const attrs = [
                { name: 'commonName', value: domain },
                { name: 'countryName', value: 'US' },
                { name: 'stateOrProvinceName', value: 'CA' },
                { name: 'localityName', value: 'San Francisco' },
                { name: 'organizationName', value: 'LAM Development' },
                { name: 'organizationalUnitName', value: 'Development' }
            ];

            const opts = {
                keySize: 2048,
                days: 365,
                algorithm: 'sha256',
                extensions: [{
                    name: 'subjectAltName',
                    altNames: [
                        { type: 2, value: domain },
                        { type: 2, value: `*.${domain.split('.').slice(1).join('.')}` },
                        { type: 7, ip: '127.0.0.1' },
                        { type: 7, ip: '::1' }
                    ]
                }]
            };

            const pems = selfsigned.generate(attrs, opts);

            // Ensure certs directory exists
            if (!fs.existsSync(this.config.certsPath)) {
                fs.mkdirSync(this.config.certsPath, { recursive: true });
            }

            // Save certificate files
            const certDir = path.join(this.config.certsPath, domain.replace(/\*/g, 'wildcard'));
            if (!fs.existsSync(certDir)) {
                fs.mkdirSync(certDir, { recursive: true });
            }

            const keyPath = path.join(certDir, 'key.pem');
            const certPath = path.join(certDir, 'cert.pem');

            fs.writeFileSync(keyPath, pems.private);
            fs.writeFileSync(certPath, pems.cert);

            console.log(`Certificate generated successfully for ${domain}`);
            return { keyPath, certPath };
        } catch (error) {
            console.error(`Error generating certificate for ${domain}:`, error);
            throw error;
        }
    }

    getCertificateForDomain(domain) {
        try {
            // First check for exact domain certificate
            let certDir = path.join(this.config.certsPath, domain);
            if (!fs.existsSync(certDir)) {
                // Check for wildcard certificate
                const parts = domain.split('.');
                if (parts.length > 2) {
                    const wildcardDomain = `*.${parts.slice(1).join('.')}`;
                    certDir = path.join(this.config.certsPath, wildcardDomain.replace(/\*/g, 'wildcard'));
                }
            }

            if (!fs.existsSync(certDir)) {
                // Generate certificate if it doesn't exist
                return this.generateCertificateForDomain(domain);
            }

            const keyPath = path.join(certDir, 'key.pem');
            const certPath = path.join(certDir, 'cert.pem');

            if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
                // Regenerate if files are missing
                return this.generateCertificateForDomain(domain);
            }

            return { keyPath, certPath };
        } catch (error) {
            console.error(`Error getting certificate for ${domain}:`, error);
            throw error;
        }
    }

    createSecureContext(domain) {
        try {
            // Check if mapping has custom certificate paths
            const mappings = this.mappingsManager.getMappings();
            const mapping = mappings.mappings.find(m => m.domain === domain);

            let keyPath, certPath;
            if (mapping && mapping.certKeyPath && mapping.certCertPath) {
                keyPath = mapping.certKeyPath;
                certPath = mapping.certCertPath;
                console.log(`Using custom certificate for ${domain}: ${keyPath}, ${certPath}`);
            } else {
                const cert = this.getCertificateForDomain(domain);
                keyPath = cert.keyPath;
                certPath = cert.certPath;
            }

            return {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };
        } catch (error) {
            console.error(`Failed to load certificate for ${domain}:`, error);
            return null;
        }
    }
}

module.exports = CertificateManager;
