# 🧠 LAM - Localhost Apps Manager

A local reverse proxy and domain manager that lets developers map local ports to custom `.local` domains with optional HTTPS support.

## Features

- **Domain ↔ Port Mapping**: Map custom `.local` domains to localhost ports
- **Automatic Hosts Management**: Automatically updates `/etc/hosts` (requires sudo for initial setup)
- **Web Dashboard**: User-friendly interface to manage mappings
- **API Integration**: REST API for programmatic registration
- **Persistent Storage**: JSON-based storage for mappings
- **Instant Redirects**: Zero-latency HTTP redirects to localhost ports

## Quick Start

### Installation

Install LAM globally:

```bash
npm install -g lam-cli@latest
```

### Running the Server

Start LAM:

```bash
sudo lam-cli start
```

**That's it!** LAM is now running at `http://localhost:80` and you can start using `.local` domains for your development projects.

### How LAM Works

1. **Install globally:**
   ```bash
   npm install -g lam-cli@latest
   ```

2. **Start LAM:**
   ```bash
   sudo lam-cli start
   ```

3. **Access LAM:**
   - Dashboard: `http://localhost:80`
   - API: `http://localhost:80/api/register`

4. **Register apps:**
   ```bash
   curl -X POST http://localhost:80/api/register \
     -H "Content-Type: application/json" \
     -d '{"project":"myapp","port":3000}'
   ```

5. **Access apps:**
   - `http://myapp.local` → `http://localhost:3000`

### Option 1: Manual Startup (Development)

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Start LAM

```bash
npm start
```

LAM will start on `http://localhost:80` (or configured port)

#### 3. Access the Web Dashboard

Open `http://localhost:80` in your browser to manage your mappings.

### Option 2: Easy Startup (Recommended)

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Start LAM with Auto-Setup

```bash
npm run start:service
```

This script automatically:
- Installs dependencies if needed
- Handles sudo privileges for port binding and hosts file access
- Starts LAM with proper configuration

#### 3. Access the Web Dashboard

Open `http://localhost:80` in your browser to manage your mappings.

### Option 3: System Service (Auto-start on boot)

#### 1. Install as System Service

```bash
npm run install:service
```

This installs LAM as a system service that starts automatically on boot.

#### 2. Manage the Service

**Linux (systemd):**
```bash
sudo systemctl start lam     # Start service
sudo systemctl stop lam      # Stop service
sudo systemctl restart lam   # Restart service
sudo systemctl status lam    # Check status
```

**macOS (launchd):**
```bash
sudo launchctl kickstart -k system/com.lam  # Restart service
sudo launchctl stop com.lam                 # Stop service
sudo launchctl list | grep com.lam          # Check status
```

#### 3. Uninstall Service

```bash
npm run uninstall:service
```

### 4. Add Your First Mapping

Use the web interface or make a POST request:

```bash
curl -X POST http://localhost:80/api/register \
  -H "Content-Type: application/json" \
  -d '{"project":"myapp","port":3000}'
```

## API Endpoints

### Register a New Mapping

```http
POST /api/register
Content-Type: application/json

{
  "project": "myapp",
  "port": 3000,
  "https": false
}
```

**Response:**
```json
{
  "domain": "myapp.local",
  "url": "http://myapp.local",
  "port": 3000,
  "https": false
}
```

### Get All Mappings

```http
GET /api/mappings
```

### Remove a Mapping

```http
DELETE /api/mappings/myapp.local
```

## Manual Hosts File Management

If automatic hosts file updates don't work, you can manually update `/etc/hosts`:

```bash
# Add entry
echo "127.0.0.1 myapp.local" | sudo tee -a /etc/hosts

# Or use the provided script
sudo node scripts/update-hosts.js myapp.local add
```

## Configuration

Edit `~/.lam/config.json` to customize:

```json
{
  "httpPort": 80,
  "httpsPort": 443,
  "storagePath": "~/.lam/mappings.json",
  "certsPath": "~/.lam/certs",
  "hostsFile": "/etc/hosts",
  "enableHttps": false,
  "autoUpdateHosts": true
}
```

## Example Usage

1. **Start your development server** (e.g., Next.js on port 3000)

2. **Register with LAM:**
   ```bash
   curl -X POST http://localhost:80/api/register \
     -H "Content-Type: application/json" \
     -d '{"project":"myapp","port":3000}'
   ```

3. **Access your app** at `http://myapp.local`

## Project Structure

```
lam/
├── server.js                 # Main application server
├── package.json
├── config.json               # System configuration
├── bin/
│   └── lam.js                # CLI installer (npx lam-cli)
├── storage/
│   └── mappings.json         # Domain-port mappings
├── certs/                    # SSL certificates (future)
├── scripts/
│   ├── start-lam.sh          # Easy startup script
│   ├── install-service.sh    # Service installation script
│   ├── uninstall-service.sh  # Service uninstallation script
│   ├── lam.service           # Systemd service file (Linux)
│   ├── com.lam.plist         # Launchd service file (macOS)
│   └── update-hosts.js       # Manual hosts file management
├── public/
│   ├── index.html            # Web dashboard
│   ├── style.css             # Dashboard styles
│   └── script.js             # Dashboard functionality
└── README.md
```

## Next.js Integration

Use the [Next.js LAM Plugin](https://www.npmjs.com/package/nextjs-lam-plugin/) for automatic integration:

```bash
npm install --save-dev nextjs-lam-plugin
```

```javascript
// next.config.js
const { withLam } = require('nextjs-lam-plugin');

module.exports = withLam({
  reactStrictMode: true,
});
```

The plugin automatically:
- Registers your Next.js dev server with LAM
- Enables proxy mode for HMR support
- Configures allowed origins for hot reloading

## HTTPS Support (Future)

HTTPS support is planned for future releases using local CA certificates.

## Troubleshooting

### Permission Denied for Hosts File

The application tries to automatically update `/etc/hosts`, but this requires elevated privileges. If you see permission errors:

1. **Option 1**: Run LAM with sudo (not recommended for development)
2. **Option 2**: Manually update your hosts file
3. **Option 3**: Disable auto-update in `config.json`

### Port Already in Use

If port 80 is busy, change the `httpPort` in `config.json`.

## Contributing

This is a development tool. Feel free to submit issues and pull requests.

## License

MIT
