#!/bin/bash
# Setup RS11 Configuration Utility as systemd service on Raspberry Pi

set -e

echo "Setting up RS11 Configuration Utility service..."

# Install dependencies
cd ~/code/becoming/apps/rs11-configuration-utility
npm install

# Copy service file to systemd
sudo cp rs11-config.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable rs11-config
sudo systemctl start rs11-config

# Add sudoers entry for passwordless restart
SUDOERS_FILE="/etc/sudoers.d/geoff-rs11"
echo "Adding passwordless sudo for service restart..."
echo "$USER ALL=(ALL) NOPASSWD: /bin/systemctl restart rs11-config" | sudo tee $SUDOERS_FILE > /dev/null
echo "$USER ALL=(ALL) NOPASSWD: /bin/systemctl stop rs11-config" | sudo tee -a $SUDOERS_FILE > /dev/null
echo "$USER ALL=(ALL) NOPASSWD: /bin/systemctl start rs11-config" | sudo tee -a $SUDOERS_FILE > /dev/null
echo "$USER ALL=(ALL) NOPASSWD: /bin/systemctl status rs11-config" | sudo tee -a $SUDOERS_FILE > /dev/null
sudo chmod 0440 $SUDOERS_FILE

echo ""
echo "✓ Service installed and started"
echo "✓ Sudoers configured for passwordless restart"
echo ""
echo "Check status with: sudo systemctl status rs11-config"
echo "View logs with: journalctl -u rs11-config -f"
