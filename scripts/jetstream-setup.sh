#!/bin/bash
# Creates the systemd service for the Jetstream subscriber
# Run with: sudo bash scripts/jetstream-setup.sh

set -e

cat > /etc/systemd/system/nomare-jetstream.service <<EOF
[Unit]
Description=Nomare Jetstream Subscriber
After=network.target

[Service]
Type=simple
User=dave
WorkingDirectory=/home/dave/repos/nomare
ExecStart=/usr/bin/npx tsx scripts/jetstream.ts
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nomare-jetstream

echo "Created nomare-jetstream.service"
echo "Start with: sudo systemctl start nomare-jetstream"
echo "Logs: journalctl -u nomare-jetstream -f"
