#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Ensure Puppeteer downloads Chromium to the cache directory
# (Render environment variables will be available here)
npx puppeteer install
