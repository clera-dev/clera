#!/bin/bash

# Change to the script's directory
cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Install requirements
    echo "Installing requirements..."
    pip install -r requirements.txt
    
    echo "Virtual environment set up successfully"
else
    # Activate virtual environment
    source venv/bin/activate
    
    # Check if we need to update packages
    echo "Checking for package updates..."
    pip install --upgrade -r requirements.txt
fi

# Run the agent directly
echo "Starting Clera Voice Agent..."
python agent.py

# Deactivate virtual environment
deactivate 