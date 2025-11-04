#!/bin/bash

# LAM Service Installation Script
# Installs LAM as a system service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}🔧 LAM Service Installation${NC}"
echo -e "${BLUE}============================${NC}"

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    echo -e "${GREEN}🐧 Detected Linux system${NC}"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    echo -e "${GREEN}🍎 Detected macOS system${NC}"
else
    echo -e "${RED}❌ Unsupported operating system: $OSTYPE${NC}"
    exit 1
fi

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${YELLOW}⚠️  This script needs to run as root to install system services${NC}"
    echo -e "${YELLOW}   Re-running with sudo...${NC}"
    exec sudo "$0" "$@"
fi

# Replace /path/to/lam with actual path in service files
LAM_PATH="$PROJECT_DIR"

if [[ "$OS" == "linux" ]]; then
    SERVICE_FILE="$SCRIPT_DIR/lam.service"
    TARGET_SERVICE_FILE="/etc/systemd/system/lam.service"

    echo -e "${YELLOW}📝 Configuring systemd service...${NC}"

    # Replace placeholder paths
    sed "s|/path/to/lam|$LAM_PATH|g" "$SERVICE_FILE" | sed "s|/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin|/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:/opt/homebrew/bin|g" > "$TARGET_SERVICE_FILE"

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable lam.service

    echo -e "${GREEN}✅ LAM service installed successfully!${NC}"
    echo -e "${YELLOW}🚀 To start LAM: sudo systemctl start lam${NC}"
    echo -e "${YELLOW}🔄 To restart LAM: sudo systemctl restart lam${NC}"
    echo -e "${YELLOW}⏹️  To stop LAM: sudo systemctl stop lam${NC}"
    echo -e "${YELLOW}📊 To check status: sudo systemctl status lam${NC}"

elif [[ "$OS" == "macos" ]]; then
    SERVICE_FILE="$SCRIPT_DIR/com.lam.plist"
    TARGET_SERVICE_FILE="/Library/LaunchDaemons/com.lam.plist"

    echo -e "${YELLOW}📝 Configuring launchd service...${NC}"

    # Replace placeholder paths
    sed "s|/path/to/lam|$LAM_PATH|g" "$SERVICE_FILE" | sed "s|/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin|/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:/opt/homebrew/bin|g" > "$TARGET_SERVICE_FILE"

    # Set proper permissions
    chown root:wheel "$TARGET_SERVICE_FILE"
    chmod 644 "$TARGET_SERVICE_FILE"

    # Load the service
    launchctl load "$TARGET_SERVICE_FILE"

    echo -e "${GREEN}✅ LAM service installed successfully!${NC}"
    echo -e "${YELLOW}🚀 LAM will start automatically on boot${NC}"
    echo -e "${YELLOW}🔄 To restart LAM: sudo launchctl kickstart -k system/com.lam${NC}"
    echo -e "${YELLOW}⏹️  To stop LAM: sudo launchctl stop com.lam${NC}"
    echo -e "${YELLOW}📊 To check status: sudo launchctl list | grep com.lam${NC}"
fi

echo -e "${GREEN}🎉 Installation complete!${NC}"
PORT=$(node -p "require('$PROJECT_DIR/config.json').httpPort || 8080" 2>/dev/null || echo "80")
echo -e "${BLUE}LAM Dashboard will be available at: http://localhost:$PORT${NC}"
