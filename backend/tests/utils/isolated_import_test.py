#!/usr/bin/env python3
"""
Isolated import test that manually imports the modules without using the package structure.
"""

import sys
import os
from decimal import Decimal

# Move to the root directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    print("Testing direct import...")
    # Import the portfolio_types directly from the file path
    sys.path.insert(0, os.path.abspath('.'))
    
    # Import directly from the file without going through __init__.py
    from clera_agents.types.portfolio_types import AssetClass, SecurityType, TargetPortfolio, RiskProfile
    from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyzer
    
    print("✅ Successfully imported all classes")
    
    # Create a test position
    position = PortfolioPosition(
        symbol="AAPL",
        quantity=Decimal("10"),
        current_price=Decimal("200.00"),
        market_value=Decimal("2000.00")
    )
    
    print(f"✅ Created position: {position.symbol}, {position.quantity} shares")
    print("Test successful!")
    
except Exception as e:
    print(f"❌ Error: {type(e).__name__}: {e}") 