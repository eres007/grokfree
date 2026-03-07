#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Clear any old cache just in case
rm -rf .cache/puppeteer

# Explicitly install the browser for this environment
# This will use puppeteer-config.cjs and put it in .cache/puppeteer
npx puppeteer install chrome
