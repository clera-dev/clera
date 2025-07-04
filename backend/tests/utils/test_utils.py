#!/usr/bin/env python3
"""
Test utilities for working with LangChain tools in unit tests.

This module provides wrapper functions that make it easier to call
functions decorated with LangChain's @tool decorator in unit tests.
"""

from typing import Any, List, Optional


def invoke_tool_function(tool_function, *args, **kwargs):
    """
    Safely invoke a function decorated with LangChain's @tool decorator.
    
    This function handles the proper way to call a tool-decorated function
    by using the .invoke() method instead of directly calling the function.
    
    Args:
        tool_function: The tool-decorated function to invoke
        *args: Positional arguments to pass to the function
        **kwargs: Keyword arguments to pass to the function
        
    Returns:
        The result from the tool function
    """
    # If no args are provided but we have kwargs, use kwargs as the input
    if not args and kwargs:
        return tool_function.invoke(kwargs)
    
    # If we have a single arg and no kwargs, use that as the input
    elif len(args) == 1 and not kwargs:
        return tool_function.invoke(args[0])
    
    # If we have multiple args, convert them to a dictionary with param names
    else:
        # Get the parameter names from the function signature
        param_names = tool_function.args
        if not param_names:
            # If we can't determine parameter names, use positional dictionary
            param_dict = {f"arg{i}": arg for i, arg in enumerate(args)}
        else:
            # Map args to their parameter names
            param_dict = {name: arg for name, arg in zip(param_names, args)}
            
        # Add any kwargs
        param_dict.update(kwargs)
        
        return tool_function.invoke(param_dict)


# Create specific wrappers for each tool function we're testing
def test_create_rebalance_instructions(positions_data, target_portfolio_type="aggressive"):
    """Test wrapper for create_rebalance_instructions tool."""
    from clera_agents.portfolio_management_agent import create_rebalance_instructions
    return create_rebalance_instructions.invoke({
        "positions_data": positions_data,
        "target_portfolio_type": target_portfolio_type
    }) 