#!/bin/bash

# LAM Service Uninstallation Script
# Removes LAM system service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🗑️  LAM Service Uninstallation${NC}"
echo -e "${BLUE}==============================${NC}"

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
    echo -e "${YELLOW}⚠️  This script needs to run as root to uninstall system services${NC}"
    echo -e "${YELLOW}   Re-running with sudo...${NC}"
    exec sudo "$0" "$@"
fi

if [[ "$OS" == "linux" ]]; then
    SERVICE_FILE="/etc/systemd/system/lam.service"

    if [[ -f "$SERVICE_FILE" ]]; then
        echo -e "${YELLOW}🛑 Stopping and disabling LAM service...${NC}"

        # Stop and disable service
        systemctl stop lam.service 2>/dev/null || true
        systemctl disable lam.service 2>/dev/null || true

        # Remove service file
        rm -f "$SERVICE_FILE"

        # Reload systemd
        systemctl daemon-reload

        echo -e "${GREEN}✅ LAM service uninstalled successfully!${NC}"
    else
        echo -e "${YELLOW}⚠️  LAM service not found. Nothing to uninstall.${NC}"
    fi

elif [[ "$OS" == "macos" ]]; then
    SERVICE_FILE="/Library/LaunchDaemons/com.lam.plist"

    if [[ -f "$SERVICE_FILE" ]]; then
        echo -e "${YELLOW}🛑 Stopping and unloading LAM service...${NC}"

        # Stop and unload service
        launchctl stop com.lam 2>/dev/null || true
        launchctl unload "$SERVICE_FILE" 2>/dev/null || true

        # Remove service file
        rm -f "$SERVICE_FILE"

        echo -e "${GREEN}✅ LAM service uninstalled successfully!${NC}"
    else
        echo -e "${YELLOW}⚠️  LAM service not found. Nothing to uninstall.${NC}"
    fi
fi

echo -e "${GREEN}🎉 Uninstallation complete!${NC}"
echo -e "${BLUE}Note: LAM application files and data are still intact.${NC}"
echo -e "${BLUE}To completely remove LAM, delete the project directory.${NC}"
