const dns = require('dns');

// Atlas `mongodb+srv://` URLs need an SRV DNS lookup. On some Windows setups
// Node only sees a loopback DNS server (127.0.0.1) that refuses queries, so the
// lookup fails with `querySrv ECONNREFUSED` even though the browser works.
// In that case, keep the local server first and fall back to public resolvers.
const PUBLIC_RESOLVERS = ['8.8.8.8', '1.1.1.1'];
const isLoopback = (server) => server.startsWith('127.') || server === '::1';

module.exports = () => {
    const servers = dns.getServers();
    if (servers.length && servers.every(isLoopback)) {
        dns.setServers([...servers, ...PUBLIC_RESOLVERS]);
    }
};
