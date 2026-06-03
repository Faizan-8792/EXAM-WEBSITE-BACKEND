#!/bin/bash
# Azure App Service custom startup script
# Installs Chrome dependencies required by Puppeteer for PDF certificate generation

set -e

echo "[startup] Installing Chromium runtime dependencies..."

apt-get update -qq 2>/dev/null || true
apt-get install -y --no-install-recommends \
  libglib2.0-0 \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libexpat1 \
  libxcb1 \
  libxkbcommon0 \
  libx11-6 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libatspi2.0-0 \
  2>/dev/null || echo "[startup] Warning: some packages may have failed to install"

# Clean up apt cache to reduce container layer size
rm -rf /var/lib/apt/lists/* 2>/dev/null || true

echo "[startup] Starting Node.js application..."
exec node server.js
