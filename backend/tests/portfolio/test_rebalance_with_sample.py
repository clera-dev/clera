#!/usr/bin/env python3
"""
Test script for testing the create_rebalance_instructions function 
using the provided sample position data.
"""

import os
import sys
import json
from dataclasses import dataclass
from decimal import Decimal
from typing import List, Dict, Any, Optional
from enum import Enum
from uuid import UUID

# Add the project root to the Python path to ensure imports work correctly
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import our test utility for calling tool functions
from tests.utils.test_utils import test_create_rebalance_instructions

class MockEnum(str, Enum):
    """Mock enum for testing."""
    def __repr__(self):
        return f"<{self.__class__.__name__}.{self.name}: '{self.value}'>"


class AssetClass(MockEnum):
    """Mock asset class enum."""
    US_EQUITY = 'us_equity'


class AssetExchange(MockEnum):
    """Mock exchange enum."""
    NASDAQ = 'NASDAQ'
    NYSE = 'NYSE'


class PositionSide(MockEnum):
    """Mock position side enum."""
    LONG = 'long'


@dataclass
class MockPosition:
    """
    Mock implementation of Alpaca Position object with all necessary attributes.
    """
    symbol: str
    qty: str
    current_price: str
    market_value: str
    cost_basis: str 
    avg_entry_price: str
    unrealized_pl: str
    unrealized_plpc: str
    asset_class: AssetClass = AssetClass.US_EQUITY
    exchange: AssetExchange = AssetExchange.NASDAQ
    side: PositionSide = PositionSide.LONG
    asset_id: Any = None
    asset_marginable: bool = True
    avg_entry_swap_rate: Optional[str] = None
    change_today: str = "0.0"
    lastday_price: str = "0.0"
    qty_available: str = None
    swap_rate: Optional[str] = None
    unrealized_intraday_pl: str = None
    unrealized_intraday_plpc: str = None
    usd: Optional[str] = None
    
    def __post_init__(self):
        """Set default values for fields if not provided."""
        if self.qty_available is None:
            self.qty_available = self.qty
        if self.unrealized_intraday_pl is None:
            self.unrealized_intraday_pl = self.unrealized_pl
        if self.unrealized_intraday_plpc is None:
            self.unrealized_intraday_plpc = self.unrealized_plpc


def create_sample_positions() -> List[MockPosition]:
    """
    Create the exact sample positions as provided in the example.
    """
    return [
        # Apple 
        MockPosition(
            symbol='AAPL',
            qty='8',
            current_price='237.0981',
            market_value='1896.7848',
            cost_basis='1917.76',
            avg_entry_price='239.72',
            unrealized_pl='-20.9752',
            unrealized_plpc='-0.0109373435674954',
            change_today='-0.0135708936595107',
            lastday_price='240.36',
            asset_id=UUID('b0b6dd9d-8b9b-48a9-ba46-b9d54906e415'),
        ),
        # Nvidia
        MockPosition(
            symbol='NVDA',
            qty='1',
            current_price='120.94',
            market_value='120.94',
            cost_basis='122.76',
            avg_entry_price='122.76',
            unrealized_pl='-1.82',
            unrealized_plpc='-0.0148256761159987',
            change_today='-0.0787629494210847',
            lastday_price='131.28',
            asset_id=UUID('4ce9353c-66d1-46c2-898f-fce867ab0247'),
        )
    ]


def test_with_sample_positions():
    """Test the create_rebalance_instructions function with the sample data."""
    try:
        # Import the function for reference, but we'll use the test wrapper to call it
        from clera_agents.portfolio_management_agent import create_rebalance_instructions
        print("✅ Successfully imported create_rebalance_instructions")
        
        # Get the sample positions
        sample_positions = create_sample_positions()
        
        # Test with all portfolio types
        portfolio_types = ["aggressive", "balanced", "conservative"]
        
        for portfolio_type in portfolio_types:
            print(f"\n{'=' * 80}")
            print(f"TEST CASE: Sample Portfolio with {portfolio_type.capitalize()} Strategy")
            print(f"{'=' * 80}")
            
            try:
                # Call the function using our test wrapper
                result = test_create_rebalance_instructions(
                    positions_data=sample_positions,
                    target_portfolio_type=portfolio_type
                )
                
                # Verify we got a non-empty result
                if result and isinstance(result, str) and len(result) > 0:
                    print("✅ Successfully generated rebalance instructions")
                    print(f"\nINSTRUCTIONS:\n{result}\n")
                else:
                    print("❌ Failed to generate valid rebalance instructions")
                    print(f"Result: {result}")
            except Exception as e:
                print(f"❌ Error testing {portfolio_type} strategy: {str(e)}")
                import traceback
                traceback.print_exc()
                
    except ImportError as e:
        print(f"❌ Failed to import create_rebalance_instructions: {str(e)}")
        return
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return
    
    print("\n✅ All tests completed")


if __name__ == "__main__":
    test_with_sample_positions() 