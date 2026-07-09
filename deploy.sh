#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

git pull
npm install
npm run build
mkdir -p server/data
NODE_ENV=production npm run migrate
pm2 restart partner-os || pm2 start ecosystem.config.js --only partner-os
