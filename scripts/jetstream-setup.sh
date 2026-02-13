#!/bin/bash
# Creates the systemd service for the Jetstream subscriber
# Run with: sudo bash scripts/jetstream-setup.sh

set -e

cat > /etc/systemd/system/datesky-jetstream.service <<EOF
[Unit]
Description=DateSky Jetstream Subscriber
After=network.target

[Service]
Type=simple
User=dave
WorkingDirectory=/home/dave/repos/datesky
ExecStart=/usr/bin/npx tsx scripts/jetstream.ts
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable datesky-jetstream

echo "Created datesky-jetstream.service"
echo "Start with: sudo systemctl start datesky-jetstream"
echo "Logs: journalctl -u datesky-jetstream -f"
