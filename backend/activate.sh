#!/bin/bash
# Helper script to set environment variables for development

# Prevent watchfiles from triggering on virtual environment changes
export WATCHFILES_IGNORE_PATHS="venv,site-packages,__pycache__,.git"
export WATCHFILES_FORCE_POLLING=true

# Print a confirmation message
echo "Environment variables set for development"
echo "WATCHFILES_IGNORE_PATHS: $WATCHFILES_IGNORE_PATHS"
echo "WATCHFILES_FORCE_POLLING: $WATCHFILES_FORCE_POLLING" 