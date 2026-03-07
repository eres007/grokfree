#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Clear any old Puppeteer cache if it exists
# rm -rf /opt/render/project/src/.cache/puppeteer

# Explicitly install the browser for this environment
npx puppeteer install
