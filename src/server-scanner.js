const { exec } = require('child_process');

class ServerScanner {
    constructor() {
        this.scanLocalServers = this.scanLocalServers.bind(this);
    }

    async scanLocalServers(includeAll = false) {
        return new Promise((resolve) => {
            const mappings = require('./mappings-manager').getMappings();

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

                // Convert map to array, filter out self (port 80), then sort by port number
                // If includeAll is true, include all servers; otherwise exclude mapped servers
                const results = Array.from(portMap.values())
                    .filter(server => server.port !== 80 && (includeAll ? true : !server.mapped))
                    .sort((a, b) => a.port - b.port);
                resolve(results);
            });
        });
    }

    async killProcess(pid) {
        return new Promise((resolve, reject) => {
            try {
                // Use process.kill to terminate the process
                process.kill(pid, 'SIGTERM');

                // Give it a moment to terminate gracefully, then force kill if needed
                setTimeout(() => {
                    try {
                        process.kill(pid, 'SIGKILL');
                    } catch (error) {
                        // Process already terminated
                    }
                }, 2000);

                resolve({ success: true, pid });
            } catch (error) {
                console.error('Error killing process:', error);
                reject(error);
            }
        });
    }
}

module.exports = ServerScanner;
