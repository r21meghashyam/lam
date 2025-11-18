const dgram = require('dgram');
const dns = require('dns-packet');

// Create a DNS query for fitwood.local
const query = dns.encode({
  type: 'query',
  id: 1234,
  flags: dns.RECURSION_DESIRED,
  questions: [{
    type: 'A',
    class: 'IN',
    name: 'fitwood.local'
  }]
});

const client = dgram.createSocket('udp4');

client.on('message', (msg, rinfo) => {
  const response = dns.decode(msg);
  console.log('DNS Response:', response);
  client.close();
});

client.on('error', (err) => {
  console.error('UDP error:', err);
  client.close();
});

client.send(query, 0, query.length, 15353, '127.0.0.1', (err) => {
  if (err) {
    console.error('Send error:', err);
  } else {
    console.log('DNS query sent to localhost:15353');
  }
});
