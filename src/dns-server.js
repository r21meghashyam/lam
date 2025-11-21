const mdns = require('multicast-dns')();

class DNSServer {
    constructor() {
        this.mappings = { mappings: [] };
    }

    setMappings(mappings) {
        this.mappings = mappings;
    }

    start() {
        mdns.on('query', this.handleQuery.bind(this));
        console.log('DNS server listening for all configured domain queries');
    }

    handleQuery(query) {
        const responses = [];

        query.questions.forEach(q => {
            const domain = q.name;
            const type = q.type;

            console.log(`DNS Query: ${domain} (Type: ${type})`);

            // Check if this domain has a LAM mapping
            const mapping = this.mappings.mappings.find(m => m.domain === domain);
            if (mapping) {
                if (type === 'A') {
                    console.log(`DNS Resolved: ${domain} -> 127.0.0.1 (Port: ${mapping.port})`);
                    responses.push({
                        name: domain,
                        type: 'A',
                        ttl: 300,
                        data: '127.0.0.1'
                    });
                } else if (type === 'AAAA') {
                    console.log(`DNS Resolved: ${domain} -> ::1 (Port: ${mapping.port})`);
                    responses.push({
                        name: domain,
                        type: 'AAAA',
                        ttl: 300,
                        data: '::1'
                    });
                }
            } else {
                console.log(`DNS Not found: ${domain}`);
            }
        });

        if (responses.length > 0) {
            mdns.respond({ answers: responses });
        }
    }
}

module.exports = DNSServer;
