const fs = require('fs');
const path = require('path');

// Simple script to manually update hosts file
// Usage: node scripts/update-hosts.js <domain> <action>
// Actions: add, remove

const args = process.argv.slice(2);
const domain = args[0];
const action = args[1] || 'add';

if (!domain) {
    console.log('Usage: node scripts/update-hosts.js <domain> [add|remove]');
    process.exit(1);
}

const hostsPath = '/etc/hosts';
const entry = `127.0.0.1 ${domain}`;

try {
    let hostsContent = '';

    if (fs.existsSync(hostsPath)) {
        hostsContent = fs.readFileSync(hostsPath, 'utf8');
    }

    const lines = hostsContent.split('\n');

    if (action === 'add') {
        // Check if entry already exists
        const exists = lines.some(line => line.trim() === entry);
        if (!exists) {
            lines.push(entry);
            fs.writeFileSync(hostsPath, lines.join('\n'));
            console.log(`Added ${entry} to hosts file`);
        } else {
            console.log(`Entry ${entry} already exists in hosts file`);
        }
    } else if (action === 'remove') {
        const filteredLines = lines.filter(line => line.trim() !== entry);
        if (filteredLines.length !== lines.length) {
            fs.writeFileSync(hostsPath, filteredLines.join('\n'));
            console.log(`Removed ${entry} from hosts file`);
        } else {
            console.log(`Entry ${entry} not found in hosts file`);
        }
    } else {
        console.log('Invalid action. Use "add" or "remove"');
        process.exit(1);
    }
} catch (error) {
    console.error('Error updating hosts file:', error.message);
    console.log('You may need to run this script with elevated privileges (sudo)');
    process.exit(1);
}
