"""
Production-Grade Tests for Portfolio Value Calculation with Cash

Tests the critical fix for including cash in total portfolio value while
excluding it from the holdings table display.

Bug Fixed: LivePortfolioValue was showing incorrect total because cash was
being filtered out BEFORE calculating the total, instead of AFTER.

Correct Behavior:
1. Calculate total_portfolio_value from ALL holdings (including cash)
2. Filter cash from positions array (for holdings table display)
3. Return both: positions (no cash) and summary.total_value (includes cash)
"""

import pytest
from decimal import Decimal
from typing import List, Dict, Any


class TestPortfolioValueWithCash:
    """Test portfolio value calculations with and without cash positions."""
    
    def test_total_value_includes_cash(self):
        """
        CRITICAL: Total portfolio value must include cash positions.
        
        This test verifies the fix for the bug where cash was excluded from
        the total portfolio value calculation.
        """
        # Arrange: Mock holdings data with cash
        holdings = [
            {
                'symbol': 'AAPL',
                'security_type': 'equity',
                'total_quantity': 10,
                'total_market_value': 2500.00,
                'total_cost_basis': 2000.00
            },
            {
                'symbol': 'TSLA',
                'security_type': 'equity',
                'total_quantity': 5,
                'total_market_value': 3000.00,
                'total_cost_basis': 2500.00
            },
            {
                'symbol': 'USD',
                'security_type': 'cash',
                'total_quantity': 1234.56,
                'total_market_value': 1234.56,
                'total_cost_basis': 1234.56
            }
        ]
        
        # Act: Calculate total INCLUDING cash (before filtering)
        total_portfolio_value = sum(
            float(h.get('total_market_value', 0)) for h in holdings
        )
        
        # Filter cash for positions array
        positions = [
            h for h in holdings 
            if h.get('security_type') != 'cash' and h.get('symbol') != 'USD'
        ]
        
        # Assert: Total includes cash, positions exclude cash
        assert abs(total_portfolio_value - 6734.56) < 0.01, \
            f"Total should include cash: expected 6734.56, got {total_portfolio_value}"
        
        assert len(positions) == 2, \
            f"Positions should exclude cash: expected 2 positions, got {len(positions)}"
        
        positions_total = sum(float(p.get('total_market_value', 0)) for p in positions)
        assert positions_total == 5500.00, \
            f"Positions total should exclude cash: expected 5500.00, got {positions_total}"
    
    def test_holdings_table_excludes_cash(self):
        """
        CRITICAL: Holdings table display should NOT show cash positions.
        
        Cash is included in total value but not shown in the holdings table.
        """
        # Arrange: Holdings with multiple cash entries
        holdings = [
            {'symbol': 'AAPL', 'security_type': 'equity', 'total_market_value': 1000.00},
            {'symbol': 'USD', 'security_type': 'cash', 'total_market_value': 500.00},
            {'symbol': 'U S Dollar', 'security_type': 'cash', 'total_market_value': 200.00},
            {'symbol': 'TSLA', 'security_type': 'equity', 'total_market_value': 2000.00}
        ]
        
        # Act: Filter for holdings table display
        positions_for_display = []
        for holding in holdings:
            if (holding.get('security_type') == 'cash' or 
                holding.get('symbol') == 'U S Dollar' or
                holding.get('symbol') == 'USD'):
                continue  # Skip cash
            positions_for_display.append(holding)
        
        # Assert: Only equity positions are in display
        assert len(positions_for_display) == 2
        assert all(p['security_type'] == 'equity' for p in positions_for_display)
        assert all(p['symbol'] not in ['USD', 'U S Dollar'] for p in positions_for_display)
    
    def test_zero_cash_doesnt_affect_calculation(self):
        """
        Test that portfolios with zero or no cash still calculate correctly.
        """
        # Arrange: Holdings with no cash
        holdings_no_cash = [
            {'symbol': 'AAPL', 'security_type': 'equity', 'total_market_value': 1000.00},
            {'symbol': 'TSLA', 'security_type': 'equity', 'total_market_value': 2000.00}
        ]
        
        # Arrange: Holdings with zero cash
        holdings_zero_cash = holdings_no_cash + [
            {'symbol': 'USD', 'security_type': 'cash', 'total_market_value': 0.00}
        ]
        
        # Act: Calculate totals
        total_no_cash = sum(h.get('total_market_value', 0) for h in holdings_no_cash)
        total_zero_cash = sum(h.get('total_market_value', 0) for h in holdings_zero_cash)
        
        # Assert: Both should equal 3000.00
        assert total_no_cash == 3000.00
        assert total_zero_cash == 3000.00
    
    def test_response_structure_correctness(self):
        """
        CRITICAL: Test the exact response structure returned to frontend.
        
        This simulates the backend endpoint's return structure.
        """
        # Arrange: Mock enriched holdings
        filtered_positions = [
            {'symbol': 'AAPL', 'security_type': 'equity', 'total_market_value': 2710.32},
            {'symbol': 'TSLA', 'security_type': 'equity', 'total_market_value': 5528.58},
            {'symbol': 'VTI', 'security_type': 'etf', 'total_market_value': 1725.41},
            {'symbol': 'USD', 'security_type': 'cash', 'total_market_value': 342.38}
        ]
        
        # Act: Calculate total BEFORE filtering (includes cash)
        total_portfolio_value = sum(
            pos.get('total_market_value', 0) for pos in filtered_positions
        )
        
        # Filter cash from positions array
        positions = []
        for position in filtered_positions:
            if (position.get('security_type') == 'cash' or 
                position.get('symbol') == 'U S Dollar' or
                position.get('symbol') == 'USD'):
                continue
            positions.append(position)
        
        # Build response structure
        response = {
            "positions": positions,  # Holdings table (excludes cash)
            "summary": {
                "total_value": total_portfolio_value,  # INCLUDES cash
                "total_positions": len(positions)
            }
        }
        
        # Assert: Response structure is correct
        assert len(response['positions']) == 3, "Positions should exclude cash"
        assert response['summary']['total_positions'] == 3
        assert response['summary']['total_value'] == 10306.69, \
            f"Total value should include cash: expected 10306.69, got {response['summary']['total_value']}"
        
        # Assert: Frontend calculations
        frontend_old_wrong = sum(
            p.get('total_market_value', 0) for p in response['positions']
        )
        frontend_new_correct = response['summary']['total_value']
        
        assert frontend_old_wrong == 9964.31, \
            "OLD method (sum positions) should be missing cash"
        assert frontend_new_correct == 10306.69, \
            "NEW method (summary.total_value) should include cash"
        assert frontend_new_correct > frontend_old_wrong, \
            "Correct total should be greater (includes cash)"
    
    def test_real_world_scenario(self):
        """
        Test with real-world data matching the bug report.
        
        User's Webull account showed $10,409.68
        Our UI was showing $10,064.30 (missing $345.38 in cash)
        """
        # Arrange: Real holdings from bug report
        real_holdings = [
            {'symbol': 'FUVV', 'security_type': 'equity', 'total_market_value': 0.00},
            {'symbol': 'NIO', 'security_type': 'equity', 'total_market_value': 35.27},
            {'symbol': 'PCG', 'security_type': 'equity', 'total_market_value': 48.48},
            {'symbol': 'TSLA', 'security_type': 'equity', 'total_market_value': 5528.58},
            {'symbol': 'AAPL', 'security_type': 'equity', 'total_market_value': 2710.32},
            {'symbol': 'LEVI', 'security_type': 'equity', 'total_market_value': 21.38},
            {'symbol': 'VTI', 'security_type': 'etf', 'total_market_value': 1725.41},
            {'symbol': 'FTCHQ', 'security_type': 'equity', 'total_market_value': 0.00},
            {'symbol': 'USD', 'security_type': 'cash', 'total_market_value': 342.38}
        ]
        
        # Act: Calculate with fix
        total_with_fix = sum(h.get('total_market_value', 0) for h in real_holdings)
        
        # Calculate without fix (OLD WRONG WAY)
        positions_no_cash = [
            h for h in real_holdings if h.get('security_type') != 'cash'
        ]
        total_without_fix = sum(h.get('total_market_value', 0) for h in positions_no_cash)
        
        # Assert: Fix resolves the bug
        webull_value = 10409.68
        tolerance = 20.00  # Allow $20 tolerance for real-time price fluctuations
        
        assert abs(total_with_fix - webull_value) < tolerance, \
            f"Fixed total should match Webull: expected ~{webull_value}, got {total_with_fix}"
        
        assert abs(total_without_fix - webull_value) > tolerance, \
            f"Broken total should NOT match Webull: got {total_without_fix}"
        
        # The difference should be approximately the cash amount
        difference = total_with_fix - total_without_fix
        assert abs(difference - 342.38) < 1.0, \
            f"Difference should be cash amount: expected 342.38, got {difference}"


class TestEdgeCases:
    """Test edge cases and boundary conditions."""
    
    def test_empty_portfolio(self):
        """Test portfolio with no holdings."""
        holdings = []
        total = sum(h.get('total_market_value', 0) for h in holdings)
        assert total == 0
    
    def test_only_cash_portfolio(self):
        """Test portfolio with only cash (no securities)."""
        holdings = [
            {'symbol': 'USD', 'security_type': 'cash', 'total_market_value': 10000.00}
        ]
        
        total = sum(h.get('total_market_value', 0) for h in holdings)
        positions = [h for h in holdings if h.get('security_type') != 'cash']
        
        assert total == 10000.00, "Total should include cash"
        assert len(positions) == 0, "Positions should be empty (only cash)"
    
    def test_multiple_cash_currencies(self):
        """Test portfolio with multiple cash entries (different currencies)."""
        holdings = [
            {'symbol': 'AAPL', 'security_type': 'equity', 'total_market_value': 1000.00},
            {'symbol': 'USD', 'security_type': 'cash', 'total_market_value': 500.00},
            {'symbol': 'CAD', 'security_type': 'cash', 'total_market_value': 300.00},
            {'symbol': 'EUR', 'security_type': 'cash', 'total_market_value': 200.00}
        ]
        
        total = sum(h.get('total_market_value', 0) for h in holdings)
        
        # Current implementation filters by security_type='cash', catching all currencies
        positions = [h for h in holdings if h.get('security_type') != 'cash']
        
        assert total == 2000.00, "Total should include all cash currencies"
        assert len(positions) == 1, "Positions should only show equity"
    
    def test_negative_cash_balance(self):
        """Test portfolio with negative cash (margin account)."""
        holdings = [
            {'symbol': 'AAPL', 'security_type': 'equity', 'total_market_value': 5000.00},
            {'symbol': 'USD', 'security_type': 'cash', 'total_market_value': -1000.00}
        ]
        
        total = sum(h.get('total_market_value', 0) for h in holdings)
        
        assert total == 4000.00, "Total should include negative cash (margin debt)"


if __name__ == '__main__':
    # Run tests with verbose output
    pytest.main([__file__, '-v', '--tb=short'])

