const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.homeDir = require('os').homedir();
        this.configDir = path.join(this.homeDir, '.lam');
        this.configPath = path.join(this.configDir, 'config.json');
    }

    getDefaultConfig() {
        return {
            httpPort: 80,
            httpsPort: 443,
            storagePath: path.join(this.homeDir, '.lam', 'mappings.json'),
            certsPath: path.join(this.homeDir, '.lam', 'certs'),
            hostsFile: "/etc/hosts",
            enableHttps: false,
            autoUpdateHosts: false,  // Disabled since mDNS responder handles resolution
            enableWebSocketProxy: false
        };
    }

    loadConfig() {
        const defaultConfig = this.getDefaultConfig();

        if (!fs.existsSync(this.configPath)) {
            // Create default config
            fs.mkdirSync(this.configDir, { recursive: true });
            fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        } else {
            let config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            // Update config with any missing properties and force enableHttps
            let configUpdated = false;
            for (const [key, value] of Object.entries(defaultConfig)) {
                if (config[key] === undefined || (key === 'enableHttps' && config[key] !== value)) {
                    config[key] = value;
                    configUpdated = true;
                }
            }
            if (configUpdated) {
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            }
            return config;
        }
    }

    saveConfig(config) {
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    }
}

module.exports = new ConfigManager();
