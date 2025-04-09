#!/bin/bash
# Helper script to set environment variables for development

# Prevent watchfiles from triggering on virtual environment changes
export WATCHFILES_IGNORE_PATHS=".venv:venv:site-packages:__pycache__:.git"

# Print a confirmation message
echo "Environment variables set for development"
echo "WATCHFILES_IGNORE_PATHS: $WATCHFILES_IGNORE_PATHS" 