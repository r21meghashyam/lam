#!/bin/bash

# LAM Startup Script
# This script handles the privileged operations needed for LAM

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}🚀 Starting LAM (Localhost Apps Manager)...${NC}"

# Check if we're running as root
if [[ $EUID -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  Running as root - this is not recommended for development${NC}"
    echo -e "${YELLOW}   Consider using the system service instead${NC}"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
    exit 1
fi

# Navigate to project directory
cd "$PROJECT_DIR"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Check if config.json exists
if [ ! -f "config.json" ]; then
    echo -e "${RED}❌ config.json not found. Please ensure the configuration file exists.${NC}"
    exit 1
fi

# Create storage directory if it doesn't exist
mkdir -p storage

# Check if we need to bind to privileged ports
CONFIG_PORT=$(node -p "require('./config.json').httpPort || 8080")
if [ "$CONFIG_PORT" -lt 1024 ] && [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}⚠️  LAM is configured to use port $CONFIG_PORT which requires root privileges${NC}"
    echo -e "${YELLOW}   Attempting to use sudo...${NC}"

    # Re-run this script with sudo
    exec sudo "$0" "$@"
fi

# Check if hosts file is writable or if we need sudo for hosts updates
HOSTS_FILE=$(node -p "require('./config.json').hostsFile || '/etc/hosts'")
if [ -f "$HOSTS_FILE" ] && [ ! -w "$HOSTS_FILE" ] && [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Hosts file ($HOSTS_FILE) is not writable${NC}"
    echo -e "${YELLOW}   LAM may not be able to automatically update hosts entries${NC}"
    echo -e "${YELLOW}   Consider running with sudo or disabling autoUpdateHosts in config.json${NC}"
fi

echo -e "${GREEN}🌐 Starting LAM server...${NC}"

# Start the server
exec npm start
