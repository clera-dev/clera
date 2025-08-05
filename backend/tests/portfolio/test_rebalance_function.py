#!/usr/bin/env python3
"""
Test script for testing the create_rebalance_instructions function 
after moving portfolio_analysis.py to the tools directory.

This test script simulates Alpaca positions and tests the rebalancing
function with different target portfolio types.
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
project_root = os.path.abspath(current_dir)
sys.path.insert(0, project_root)

# Import our test utility for calling tool functions
from tests.test_utils import test_create_rebalance_instructions

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
    asset_id: UUID = None
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
        if self.asset_id is None:
            self.asset_id = UUID('00000000-0000-0000-0000-000000000000')


def create_test_positions() -> List[MockPosition]:
    """Create a diverse set of test positions to simulate an actual portfolio."""
    return [
        # Apple - Tech stock
        MockPosition(
            symbol='AAPL',
            qty='10',
            current_price='200.00',
            market_value='2000.00',
            cost_basis='1900.00',
            avg_entry_price='190.00',
            unrealized_pl='100.00',
            unrealized_plpc='0.0526315789'
        ),
        # Microsoft - Tech stock
        MockPosition(
            symbol='MSFT',
            qty='5',
            current_price='400.00',
            market_value='2000.00',
            cost_basis='1850.00',
            avg_entry_price='370.00',
            unrealized_pl='150.00',
            unrealized_plpc='0.0810810811'
        ),
        # S&P 500 ETF - Broad market ETF
        MockPosition(
            symbol='SPY',
            qty='4',
            current_price='500.00',
            market_value='2000.00',
            cost_basis='1800.00',
            avg_entry_price='450.00',
            unrealized_pl='200.00',
            unrealized_plpc='0.1111111111'
        ),
        # Bond ETF - Fixed income
        MockPosition(
            symbol='AGG',
            qty='20',
            current_price='100.00',
            market_value='2000.00',
            cost_basis='2100.00',
            avg_entry_price='105.00',
            unrealized_pl='-100.00',
            unrealized_plpc='-0.0476190476'
        ),
        # Tesla - Another stock
        MockPosition(
            symbol='TSLA',
            qty='8',
            current_price='250.00',
            market_value='2000.00',
            cost_basis='2400.00',
            avg_entry_price='300.00',
            unrealized_pl='-400.00',
            unrealized_plpc='-0.1666666667'
        ),
    ]


def create_additional_test_positions() -> List[MockPosition]:
    """Create a second set of positions with a different composition."""
    return [
        # Nvidia - Tech stock
        MockPosition(
            symbol='NVDA',
            qty='2',
            current_price='800.00',
            market_value='1600.00',
            cost_basis='1500.00',
            avg_entry_price='750.00',
            unrealized_pl='100.00',
            unrealized_plpc='0.0666666667'
        ),
        # Vanguard Total Bond Market ETF
        MockPosition(
            symbol='BND',
            qty='50',
            current_price='80.00',
            market_value='4000.00',
            cost_basis='4100.00',
            avg_entry_price='82.00',
            unrealized_pl='-100.00',
            unrealized_plpc='-0.0243902439'
        ),
        # Vanguard Real Estate ETF
        MockPosition(
            symbol='VNQ',
            qty='30',
            current_price='100.00',
            market_value='3000.00',
            cost_basis='3300.00',
            avg_entry_price='110.00',
            unrealized_pl='-300.00',
            unrealized_plpc='-0.0909090909'
        ),
        # Gold ETF
        MockPosition(
            symbol='GLD',
            qty='15',
            current_price='180.00',
            market_value='2700.00',
            cost_basis='2550.00',
            avg_entry_price='170.00',
            unrealized_pl='150.00',
            unrealized_plpc='0.0588235294'
        ),
    ]


def create_empty_portfolio() -> List[MockPosition]:
    """Create an empty portfolio for edge case testing."""
    return []


def test_create_rebalance_instructions():
    """Test the create_rebalance_instructions function with different inputs."""
    try:
        # Import the function for reference, but we'll use the test wrapper to call it
        from clera_agents.portfolio_management_agent import create_rebalance_instructions
        print("✅ Successfully imported create_rebalance_instructions")
        
        # Test with various portfolios and strategies
        test_cases = [
            {
                "name": "Diverse Portfolio - Aggressive Strategy",
                "positions": create_test_positions(),
                "portfolio_type": "aggressive"
            },
            {
                "name": "Diverse Portfolio - Balanced Strategy",
                "positions": create_test_positions(),
                "portfolio_type": "balanced"
            },
            {
                "name": "Diverse Portfolio - Conservative Strategy",
                "positions": create_test_positions(),
                "portfolio_type": "conservative"
            },
            {
                "name": "Different Portfolio Composition - Aggressive Strategy",
                "positions": create_additional_test_positions(),
                "portfolio_type": "aggressive"
            },
            {
                "name": "Empty Portfolio - Default Strategy",
                "positions": create_empty_portfolio(),
                "portfolio_type": "aggressive"
            }
        ]
        
        # Run each test case and check the output
        for test_case in test_cases:
            print(f"\n{'=' * 80}")
            print(f"TEST CASE: {test_case['name']}")
            print(f"{'=' * 80}")
            
            try:
                # Call the function using our test wrapper
                result = test_create_rebalance_instructions(
                    positions_data=test_case['positions'],
                    target_portfolio_type=test_case['portfolio_type']
                )
                
                # Verify we got a non-empty result
                if result and isinstance(result, str) and len(result) > 0:
                    print("✅ Successfully generated rebalance instructions")
                    print(f"\nINSTRUCTIONS:\n{result}\n")
                else:
                    print("❌ Failed to generate valid rebalance instructions")
                    print(f"Result: {result}")
            except Exception as e:
                print(f"❌ Error testing {test_case['name']}: {str(e)}")
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
    test_create_rebalance_instructions() 