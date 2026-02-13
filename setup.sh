#!/bin/bash
# DateSky setup script — run with sudo
# Usage: sudo bash setup.sh

set -e

DOMAIN="datesky.app"
APP_DIR="/home/dave/repos/datesky"
PORT=3003
USER="dave"

echo "=== DateSky Setup ==="
echo ""

# 1. Apache vhost (HTTP — redirect to HTTPS)
echo "[1/5] Creating Apache HTTP vhost..."
cat > /etc/apache2/sites-available/${DOMAIN}.conf <<EOF
<VirtualHost *:80>
    ServerAdmin webmaster@localhost
    ServerName ${DOMAIN}

    RewriteEngine on
    RewriteCond %{SERVER_NAME} =${DOMAIN}
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>
EOF

# 2. Apache vhost (HTTPS — reverse proxy to Next.js)
echo "[2/5] Creating Apache HTTPS vhost..."
cat > /etc/apache2/sites-available/${DOMAIN}-le-ssl.conf <<EOF
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName ${DOMAIN}
    ServerAdmin webmaster@localhost

    # Reverse proxy to Next.js
    ProxyPreserveHost On
    ProxyPass / http://localhost:${PORT}/
    ProxyPassReverse / http://localhost:${PORT}/

    # WebSocket support (for Next.js HMR in dev)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule /(.*) ws://localhost:${PORT}/\$1 [P,L]

    # Logs
    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}-error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}-access.log combined

    SSLCertificateFile /etc/letsencrypt/live/${DOMAIN}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${DOMAIN}/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
</IfModule>
EOF

# 3. Get TLS cert
echo "[3/5] Obtaining Let's Encrypt certificate..."
# Enable HTTP vhost first so certbot can verify
a2ensite ${DOMAIN}.conf
systemctl reload apache2

certbot certonly --apache -d ${DOMAIN} --non-interactive --agree-tos --email dave@plover.net

# 4. Enable HTTPS vhost
echo "[4/5] Enabling HTTPS vhost..."
a2ensite ${DOMAIN}-le-ssl.conf
systemctl reload apache2

# 5. Create systemd service for Next.js
echo "[5/5] Creating systemd service..."
cat > /etc/systemd/system/datesky.service <<EOF
[Unit]
Description=DateSky Next.js App
After=network.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${PORT}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable datesky

echo ""
echo "=== Setup complete ==="
echo ""
echo "Apache vhosts: ${DOMAIN}.conf, ${DOMAIN}-le-ssl.conf"
echo "TLS cert:      /etc/letsencrypt/live/${DOMAIN}/"
echo "Systemd unit:  datesky.service"
echo "App port:      ${PORT}"
echo ""
echo "Next steps:"
echo "  1. cd ${APP_DIR} && npm install && npm run build"
echo "  2. sudo systemctl start datesky"
echo "  3. Visit https://${DOMAIN}"
