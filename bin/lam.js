#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Colors for output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
    log(`❌ ${message}`, 'red');
}

function success(message) {
    log(`✅ ${message}`, 'green');
}

function info(message) {
    log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

class LAMInstaller {
    constructor() {
        this.installPath = path.join(require('os').homedir(), '.lam');
        this.isUpdate = false;
    }

    async run() {
        log('🚀 LAM Installer', 'bold');

        try {
            // Check if LAM is already installed
            if (this.isLAMInstalled()) {
                info('LAM is already installed.');
                await this.handleExistingInstallation();
                return;
            }

            // Install dependencies
            await this.installDependencies();

            // Download LAM
            await this.downloadLAM();

            // Configure LAM
            await this.configureLAM();

            // Install system service
            await this.installService();

            success('LAM installation completed successfully!');
            info('To start LAM, run: sudo ~/.lam/scripts/start-lam.sh');
            info('Then access LAM at: http://localhost:80');
            info('You can now use .local domains for your development projects!');

        } catch (err) {
            error(`Installation failed: ${err.message}`);
            process.exit(1);
        }
    }

    async handleExistingInstallation() {
        info('LAM is installed but needs to be started manually.');
        info('Please run: sudo ~/.lam/scripts/start-lam.sh');
        info('Then access LAM at: http://localhost:80');
    }

    isLAMInstalled() {
        return fs.existsSync(path.join(this.installPath, 'package.json'));
    }

    async installDependencies() {
        info('Checking system dependencies...');

        // Check Node.js
        try {
            execSync('node --version', { stdio: 'pipe' });
        } catch (e) {
            error('Node.js is not installed. Please install Node.js first.');
            process.exit(1);
        }

        // Check npm
        try {
            execSync('npm --version', { stdio: 'pipe' });
        } catch (e) {
            error('npm is not installed. Please install npm first.');
            process.exit(1);
        }

        success('System dependencies OK');
    }

    async downloadLAM() {
        info('Setting up LAM...');

        // Get the directory where this script is located (package root)
        const scriptDir = path.dirname(__dirname);
        const packageDir = path.resolve(scriptDir);

        // Check if we're running from within a LAM project directory (development)
        const currentDir = process.cwd();
        const isInLAMProject = fs.existsSync(path.join(currentDir, 'package.json')) &&
            fs.existsSync(path.join(currentDir, 'server.js')) &&
            fs.existsSync(path.join(currentDir, 'bin', 'lam.js'));

        // Check if we're running from a published npm package
        const isPublishedPackage = fs.existsSync(path.join(packageDir, 'package.json')) &&
            fs.existsSync(path.join(packageDir, 'server.js')) &&
            fs.existsSync(path.join(packageDir, 'bin', 'lam.js'));

        if (isInLAMProject && currentDir === packageDir) {
            // Running from LAM project directory in development
            info('Running from LAM project directory - using current installation');
            this.copyDirectory(packageDir, this.installPath);
        } else if (isPublishedPackage) {
            // Running from published npm package
            info('Running from published LAM package - installing LAM');
            this.copyDirectory(packageDir, this.installPath);
        } else {
            // Fallback - try to use the script directory
            info('Installing LAM from package directory');
            this.copyDirectory(packageDir, this.installPath);
        }

        success('LAM setup completed');
    }

    copyDirectory(source, destination) {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }

        const entries = fs.readdirSync(source, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);

            if (entry.isDirectory()) {
                // Skip node_modules and .git
                if (entry.name === 'node_modules' || entry.name === '.git') {
                    continue;
                }
                this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    async configureLAM() {
        info('Configuring LAM...');

        const configPath = path.join(this.installPath, 'config.json');

        // Create default config if it doesn't exist
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                httpPort: 80,
                httpsPort: 443,
                storagePath: "./storage/mappings.json",
                certsPath: "./certs",
                hostsFile: "/etc/hosts",
                enableHttps: false,
                autoUpdateHosts: true,
                enableWebSocketProxy: false
            };

            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        }

        // Create storage directory
        const storageDir = path.join(this.installPath, 'storage');
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        // Install npm dependencies
        process.chdir(this.installPath);
        execSync('npm install', { stdio: 'inherit' });

        success('LAM configured successfully');
    }

    async installService() {
        info('Installing system service...');

        process.chdir(this.installPath);

        // Run the install service script
        const installScript = path.join(this.installPath, 'scripts', 'install-service.sh');

        if (fs.existsSync(installScript)) {
            try {
                execSync(`bash ${installScript}`, { stdio: 'inherit' });
                success('System service installed successfully');
            } catch (e) {
                warning('System service installation failed. You can still run LAM manually.');
                info('To install the service later, run: npm run install:service');
            }
        } else {
            warning('Service installation script not found. You can install the service later.');
        }
    }

    async startLAM() {
        info('Starting LAM manually...');

        process.chdir(this.installPath);

        const startScript = path.join(this.installPath, 'scripts', 'start-lam.sh');
        if (fs.existsSync(startScript)) {
            try {
                // Start LAM in background with sudo
                const child = spawn('sudo', ['bash', startScript], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();

                // Wait a moment for startup
                await new Promise(resolve => setTimeout(resolve, 3000));

                success('LAM started successfully');
                return;
            } catch (e) {
                warning('Could not start LAM. Please run: sudo ~/.lam/scripts/start-lam.sh');
                return;
            }
        }

        warning('Could not find LAM start script. Please run: sudo ~/.lam/scripts/start-lam.sh');
    }
}

// Run the installer
const installer = new LAMInstaller();
installer.run().catch(err => {
    error(`Installation failed: ${err.message}`);
    process.exit(1);
});
