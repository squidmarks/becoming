#!/bin/bash
# Deploy inverter-monitor updates to the Pi

set -e

echo "Deploying to Pi..."
echo ""

ssh geoff@becoming-hub << 'ENDSSH'
cd ~/becoming
echo "Pulling latest changes..."
git pull
cd apps/inverter-monitor
echo "Installing dependencies..."
npm install
echo "Restarting service..."
sudo systemctl restart inverter-monitor
echo ""
echo "✓ Deployment complete!"
echo ""
echo "Checking service status..."
sudo systemctl status inverter-monitor --no-pager -l
ENDSSH

echo ""
echo "Done! Now hard refresh your browser (Cmd+Shift+R)"
