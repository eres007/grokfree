#!/usr/bin/env bash
# exit on error
set -o errexit

npm install

# Install Chrome for Puppeteer
# In Render, we can use the environment variable to point to the binary
# This script ensures the binary is available if needed, though Render usually handles it if dependencies are in package.json
# and the correct environment variables are set.
# However, for the 'Free' tier, we often need to manual install to a local dir or use a buildpack.
# For now, we will rely on the puppeteer install and standard build.
