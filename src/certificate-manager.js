const fs = require('fs');
const path = require('path');
const tls = require('tls');
const forge = require('node-forge');

class CertificateManager {
    constructor(config, mappingsManager) {
        this.config = config;
        this.mappingsManager = mappingsManager;
        this.caKey = null;
        this.caCert = null;
    }

    getCA() {
        const caKeyPath = path.join(this.config.certsPath, 'ca.key.pem');
        const caCertPath = path.join(this.config.certsPath, 'ca.cert.pem');

        // Check if CA files exist
        if (fs.existsSync(caKeyPath) && fs.existsSync(caCertPath)) {
            this.caKey = fs.readFileSync(caKeyPath).toString();
            this.caCert = fs.readFileSync(caCertPath).toString();
        } else {
            console.log('Generating CA certificate - this should only happen once');
            // Generate new CA
            console.log('Generating local CA certificate...');

            // Create CA keys
            const keys = forge.pki.rsa.generateKeyPair(2048);
            this.caKey = forge.pki.privateKeyToPem(keys.privateKey);

            // Create CA certificate
            const certForge = forge.pki.createCertificate();
            certForge.publicKey = keys.publicKey;
            certForge.serialNumber = '01';
            certForge.validity.notBefore = new Date();
            certForge.validity.notAfter = new Date();
            certForge.validity.notAfter.setFullYear(certForge.validity.notBefore.getFullYear() + 10);

            const attrs = [{
                name: 'commonName',
                value: 'LAM Local Development CA'
            }, {
                name: 'countryName',
                value: 'US'
            }, {
                name: 'organizationName',
                value: 'LAM Development'
            }];

            certForge.setSubject(attrs);
            certForge.setIssuer(attrs);
            certForge.setExtensions([{
                name: 'basicConstraints',
                critical: true,
                cA: true
            }, {
                name: 'keyUsage',
                critical: true,
                keyCertSign: true,
                cRLSign: true
            }, {
                name: 'subjectKeyIdentifier'
            }]);

            certForge.sign(keys.privateKey, forge.md.sha256.create());
            this.caCert = forge.pki.certificateToPem(certForge);

            // Save CA files
            fs.writeFileSync(caKeyPath, this.caKey);
            fs.writeFileSync(caCertPath, this.caCert);

            console.log('Local CA certificate generated and saved');
        }

        return {
            keyPem: this.caKey,
            certPem: this.caCert,
            certPath: caCertPath
        };
    }

    generateCertificateForDomain(domain) {
        try {
            console.log(`Generating SSL certificate for ${domain}...`);

            // Get or create CA
            const ca = this.getCA();

            // Create domain keys
            const keys = forge.pki.rsa.generateKeyPair(2048);
            const domainKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

            // Create domain certificate
            const certDomain = forge.pki.createCertificate();
            certDomain.publicKey = keys.publicKey;
            certDomain.serialNumber = Date.now().toString();
            certDomain.validity.notBefore = new Date();
            certDomain.validity.notAfter = new Date();
            certDomain.validity.notAfter.setFullYear(certDomain.validity.notBefore.getFullYear() + 1);

            const attrs = [{
                name: 'commonName',
                value: domain
            }, {
                name: 'countryName',
                value: 'US'
            }, {
                name: 'organizationName',
                value: 'LAM Development'
            }];

            certDomain.setSubject(attrs);
            certDomain.setIssuer(forge.pki.certificateFromPem(ca.certPem).subject.attributes);

            certDomain.setExtensions([{
                name: 'basicConstraints',
                cA: false
            }, {
                name: 'keyUsage',
                digitalSignature: true,
                keyEncipherment: true
            }, {
                name: 'extKeyUsage',
                serverAuth: true
            }, {
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: domain },
                    { type: 7, ip: '127.0.0.1' },
                    { type: 7, ip: '::1' }
                ]
            }, {
                name: 'subjectKeyIdentifier'
            }]);

            // Sign with CA private key using SHA-256 using SHA-256
            certDomain.sign(forge.pki.privateKeyFromPem(ca.keyPem), forge.md.sha256.create());

            const domainCertPem = forge.pki.certificateToPem(certDomain);

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

            fs.writeFileSync(keyPath, domainKeyPem);
            fs.writeFileSync(certPath, domainCertPem);

            console.log(`Certificate generated successfully for ${domain} (signed by local CA)`);
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

            let keyPath, certPath, caCert = null;
            if (mapping && mapping.certKeyPath && mapping.certCertPath) {
                keyPath = mapping.certKeyPath;
                certPath = mapping.certCertPath;
                console.log(`Using custom certificate for ${domain}: ${keyPath}, ${certPath}`);
            } else {
                const cert = this.getCertificateForDomain(domain);
                keyPath = cert.keyPath;
                certPath = cert.certPath;
                // For CA-signed certificates, also include the CA cert
                const ca = this.getCA();
                caCert = ca.certPem;
            }

            const contextOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };

            if (caCert) {
                contextOptions.ca = [caCert];
            }

            return tls.createSecureContext(contextOptions);
        } catch (error) {
            console.error(`Failed to load certificate for ${domain}:`, error);
            return null;
        }
    }
}

module.exports = CertificateManager;
