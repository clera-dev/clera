#!/usr/bin/env python3

"""
Helper script to locate the clera_agents module and verify it can be imported.
"""

import os
import sys
import importlib

def find_module(module_name):
    """Try to find and import a module, and return detailed information about the search process."""
    print(f"Looking for module: {module_name}")
    print(f"Python version: {sys.version}")
    print(f"Python executable: {sys.executable}")
    print(f"Current directory: {os.getcwd()}")
    print(f"Python path: {sys.path}")
    
    # Add additional paths
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
    backend_path = os.path.join(project_root, "backend")
    
    sys.path.append(project_root)
    sys.path.append(backend_path)
    
    print(f"Added project root: {project_root}")
    print(f"Added backend path: {backend_path}")
    print(f"Updated Python path: {sys.path}")
    
    # Try to import the module
    try:
        print(f"Attempting to import {module_name}...")
        module = importlib.import_module(module_name)
        print(f"Successfully imported {module_name}!")
        print(f"Module file: {module.__file__}")
        print(f"Module path: {module.__path__ if hasattr(module, '__path__') else 'N/A'}")
        return True
    except ImportError as e:
        print(f"ImportError: {e}")
        
        # Try variations of the import
        variations = [
            f"backend.{module_name}",
            module_name.split(".")[-1],
            f"backend.{module_name.split('.')[-1]}"
        ]
        
        for variation in variations:
            try:
                print(f"Trying variation: {variation}...")
                module = importlib.import_module(variation)
                print(f"Successfully imported {variation}!")
                print(f"Module file: {module.__file__}")
                print(f"Module path: {module.__path__ if hasattr(module, '__path__') else 'N/A'}")
                return True
            except ImportError as e2:
                print(f"Failed to import {variation}: {e2}")
        
        return False

def check_directory_contents(path):
    """Check the contents of a directory to help with diagnosing import issues."""
    print(f"Checking directory contents: {path}")
    try:
        if not os.path.exists(path):
            print(f"Path does not exist: {path}")
            return
        
        contents = os.listdir(path)
        print(f"Directory contents:")
        for item in contents:
            item_path = os.path.join(path, item)
            if os.path.isdir(item_path):
                print(f"  📁 {item}/")
                if item == "clera_agents" or item == "backend":
                    # Show contents of important directories
                    sub_contents = os.listdir(item_path)
                    for sub_item in sub_contents:
                        print(f"    - {sub_item}")
            else:
                print(f"  📄 {item}")
    except Exception as e:
        print(f"Error checking directory: {e}")

if __name__ == "__main__":
    # Try to find the clera_agents module
    found = find_module("clera_agents.graph")
    
    if not found:
        # Check directory contents to help diagnose issues
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
        backend_path = os.path.join(project_root, "backend")
        
        check_directory_contents(project_root)
        check_directory_contents(backend_path)
        check_directory_contents(os.path.join(backend_path, "clera_agents") if os.path.exists(os.path.join(backend_path, "clera_agents")) else backend_path)
        
        print("\nModule clera_agents.graph could not be found. Please check the above information to help diagnose the issue.")
        sys.exit(1)
    else:
        print("\nModule clera_agents.graph was found successfully!")
        sys.exit(0) 