const fs = require('fs');
const path = require('path');

class MappingsManager {
    constructor(config) {
        this.mappings = { mappings: [] };
        this.config = config;
        this.storagePath = config.storagePath;
        this.mappingsPath = path.dirname(this.storagePath);
    }

    loadMappings() {
        try {
            if (!fs.existsSync(this.mappingsPath)) {
                fs.mkdirSync(this.mappingsPath, { recursive: true });
            }
            if (fs.existsSync(this.storagePath)) {
                this.mappings = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            } else {
                this.mappings = { mappings: [] };
            }
        } catch (error) {
            console.error('Error loading mappings:', error);
        }
    }

    saveMappings() {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.mappings, null, 2));
        } catch (error) {
            console.error('Error saving mappings:', error);
        }
    }

    getMappings() {
        return this.mappings;
    }

    createMapping(project, port, https = false, tld = 'local') {
        const domain = `${project}.${tld}`;

        // Check if mapping already exists
        const existingIndex = this.mappings.mappings.findIndex(m => m.domain === domain);
        if (existingIndex >= 0) {
            this.mappings.mappings[existingIndex] = { domain, port, https, proxy: true };
        } else {
            this.mappings.mappings.push({ domain, port, https, proxy: true });
        }

        this.saveMappings();

        const url = https && this.config.enableHttps ? `https://${domain}` : `http://${domain}`;
        return { domain, url, port, https };
    }

    removeMapping(domain) {
        const index = this.mappings.mappings.findIndex(m => m.domain === domain);
        if (index >= 0) {
            this.mappings.mappings.splice(index, 1);
            this.saveMappings();
            return { success: true };
        }
        return { error: 'Mapping not found' };
    }

    updateHostsFile(domain, port, action = 'add') {
        if (this.config.autoUpdateHosts) {
            // This functionality is disabled since DNS handles resolution
            return;
        }
    }
}

let mappingsManagerInstance;

// Factory function to create/use singleton
function createMappingsManager(config) {
    if (!mappingsManagerInstance) {
        mappingsManagerInstance = new MappingsManager(config);
        mappingsManagerInstance.loadMappings();
    }
    return mappingsManagerInstance;
}

module.exports = { create: createMappingsManager, getMappings: () => mappingsManagerInstance ? mappingsManagerInstance.getMappings() : { mappings: [] } };
