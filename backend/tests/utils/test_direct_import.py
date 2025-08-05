#!/usr/bin/env python3
"""
Direct import test that avoids loading the entire application.
"""

import sys
import os
from decimal import Decimal

# Temporarily modify sys.path to avoid loading the main __init__.py
try:
    # Direct import of the modules without going through __init__.py
    sys.path.insert(0, os.path.abspath('.'))
    
    print("Testing direct import from tools directory...")
    from clera_agents.tools.portfolio_analysis import PortfolioPosition, PortfolioAnalyzer
    print("✅ Successfully imported PortfolioPosition and PortfolioAnalyzer from tools")
    
    print("\nTesting import of portfolio_types...")
    from clera_agents.types.portfolio_types import AssetClass, SecurityType, TargetPortfolio, RiskProfile
    print("✅ Successfully imported portfolio types")
    
    # Now let's create some sample objects to test
    print("\nCreating test objects...")
    position = PortfolioPosition(
        symbol="AAPL",
        quantity=Decimal("10"),
        current_price=Decimal("200.00"),
        market_value=Decimal("2000.00")
    )
    print(f"✅ Created PortfolioPosition object: {position.symbol}, {position.quantity} shares")
    
    print("\nImport test complete")
except ImportError as e:
    print(f"❌ Import error: {e}")
except Exception as e:
    print(f"❌ Other error: {type(e).__name__}: {e}") 