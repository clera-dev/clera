#!/usr/bin/env python3

"""
Test to verify the risk score calculation fix is working correctly.
This test ensures that SPY and other ETFs are properly classified and get the correct risk scores.
"""

import sys
import os
import uuid
from decimal import Decimal
from unittest.mock import Mock, MagicMock

# Add the parent directory to the path to import clera_agents
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_spy_classification_fix():
    """Test that SPY is properly classified as an ETF in the backend analytics endpoint."""
    # Import the necessary modules
    from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine, PortfolioPosition, AssetClass, SecurityType
    from api_server import map_alpaca_position_to_portfolio_position
    
    print("✅ Successfully imported required modules")
    
    # Create a mock Alpaca position for SPY
    from unittest.mock import Mock
    import uuid
    from decimal import Decimal
    mock_spy_position = Mock()
    mock_spy_position.symbol = "SPY"
    mock_spy_position.asset_id = uuid.uuid4()
    mock_spy_position.market_value = Decimal('10000')
    mock_spy_position.cost_basis = Decimal('9500')
    mock_spy_position.unrealized_pl = Decimal('500')
    mock_spy_position.qty = Decimal('100')
    mock_spy_position.current_price = Decimal('100')
    
    # Mock the asset class enum
    from alpaca.trading.enums import AssetClass as AlpacaTradingAssetClass
    mock_spy_position.asset_class = AlpacaTradingAssetClass.US_EQUITY
    
    # Test with empty asset details map (simulating failed asset fetch)
    asset_details_map = {}
    
    # Map the position using our fixed function
    portfolio_position = map_alpaca_position_to_portfolio_position(mock_spy_position, asset_details_map)
    
    print(f"✅ Successfully mapped SPY position")
    print(f"   Symbol: {portfolio_position.symbol}")
    print(f"   Asset Class: {portfolio_position.asset_class}")
    print(f"   Security Type: {portfolio_position.security_type}")
    
    # Verify SPY is classified as ETF
    assert portfolio_position.symbol == "SPY"
    assert portfolio_position.asset_class == AssetClass.EQUITY
    assert portfolio_position.security_type == SecurityType.ETF
    
    print("✅ SPY correctly classified as ETF")
    
    # Test risk score calculation with SPY as ETF
    positions = [portfolio_position]
    risk_score = PortfolioAnalyticsEngine.calculate_risk_score(positions)
    
    print(f"✅ Risk score calculated: {risk_score}")
    
    # Now test what would happen if SPY was classified as INDIVIDUAL_STOCK
    mock_spy_individual = PortfolioPosition(
        symbol="SPY",
        asset_class=AssetClass.EQUITY,
        security_type=SecurityType.INDIVIDUAL_STOCK,  # Wrong classification
        market_value=Decimal('10000'),
        cost_basis=Decimal('9500'),
        unrealized_pl=Decimal('500'),
        quantity=Decimal('100'),
        current_price=Decimal('100')
    )
    
    positions_wrong = [mock_spy_individual]
    risk_score_wrong = PortfolioAnalyticsEngine.calculate_risk_score(positions_wrong)
    
    print(f"✅ Risk score with wrong classification: {risk_score_wrong}")
    print(f"   Difference: {float(risk_score_wrong) - float(risk_score)}")
    
    # The risk score should be lower when SPY is correctly classified as ETF
    assert float(risk_score) < float(risk_score_wrong), f"ETF classification should result in lower risk score. ETF: {risk_score}, Stock: {risk_score_wrong}"
    
    print("✅ Risk score correctly lower for ETF classification")
    
    return True

def test_other_etfs_classification():
    """Test that other common ETFs are also properly classified."""
    
    from clera_agents.tools.portfolio_analysis import AssetClass, SecurityType
    from api_server import map_alpaca_position_to_portfolio_position
    from alpaca.trading.enums import AssetClass as AlpacaTradingAssetClass
    
    # Test common ETFs
    etf_symbols = ['VOO', 'QQQ', 'VTI', 'AGG', 'VNQ', 'GLD']
    
    for symbol in etf_symbols:
        mock_position = Mock()
        mock_position.symbol = symbol
        mock_position.asset_id = uuid.uuid4()
        mock_position.market_value = Decimal('5000')
        mock_position.cost_basis = Decimal('4800')
        mock_position.unrealized_pl = Decimal('200')
        mock_position.qty = Decimal('50')
        mock_position.current_price = Decimal('100')
        mock_position.asset_class = AlpacaTradingAssetClass.US_EQUITY
        
        # Test with empty asset details map
        asset_details_map = {}
        
        portfolio_position = map_alpaca_position_to_portfolio_position(mock_position, asset_details_map)
        
        assert portfolio_position.security_type == SecurityType.ETF, f"{symbol} should be classified as ETF"
        print(f"✅ {symbol} correctly classified as ETF")
        
        # Check specialized asset classes
        if symbol == 'AGG':
            assert portfolio_position.asset_class == AssetClass.FIXED_INCOME, f"AGG should be FIXED_INCOME"
            print(f"✅ {symbol} correctly classified as FIXED_INCOME")
        elif symbol == 'VNQ':
            assert portfolio_position.asset_class == AssetClass.REAL_ESTATE, f"VNQ should be REAL_ESTATE"
            print(f"✅ {symbol} correctly classified as REAL_ESTATE")
        elif symbol == 'GLD':
            assert portfolio_position.asset_class == AssetClass.COMMODITIES, f"GLD should be COMMODITIES"
            print(f"✅ {symbol} correctly classified as COMMODITIES")
        else:
            assert portfolio_position.asset_class == AssetClass.EQUITY, f"{symbol} should be EQUITY"
            print(f"✅ {symbol} correctly classified as EQUITY")
    
    return True

def test_unknown_stock_classification():
    """Test that unknown stocks are still classified as INDIVIDUAL_STOCK."""
    
    from clera_agents.tools.portfolio_analysis import AssetClass, SecurityType
    from api_server import map_alpaca_position_to_portfolio_position
    from alpaca.trading.enums import AssetClass as AlpacaTradingAssetClass
    
    # Test with a random stock symbol
    mock_position = Mock()
    mock_position.symbol = "RANDOMSTOCK"
    mock_position.asset_id = uuid.uuid4()
    mock_position.market_value = Decimal('3000')
    mock_position.cost_basis = Decimal('2800')
    mock_position.unrealized_pl = Decimal('200')
    mock_position.qty = Decimal('30')
    mock_position.current_price = Decimal('100')
    mock_position.asset_class = AlpacaTradingAssetClass.US_EQUITY
    
    # Test with empty asset details map
    asset_details_map = {}
    
    portfolio_position = map_alpaca_position_to_portfolio_position(mock_position, asset_details_map)
    
    assert portfolio_position.security_type == SecurityType.INDIVIDUAL_STOCK, "Unknown stock should be INDIVIDUAL_STOCK"
    assert portfolio_position.asset_class == AssetClass.EQUITY, "Unknown stock should be EQUITY"
    
    print("✅ Unknown stock correctly classified as INDIVIDUAL_STOCK")
    
    return True

if __name__ == "__main__":
    print("🧪 Testing Risk Score Classification Fix")
    print("=" * 50)
    
    success = True
    
    print("\n1. Testing SPY classification fix...")
    success &= test_spy_classification_fix()
    
    print("\n2. Testing other ETFs classification...")
    success &= test_other_etfs_classification()
    
    print("\n3. Testing unknown stock classification...")
    success &= test_unknown_stock_classification()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 ALL TESTS PASSED! The risk score fix is working correctly.")
    else:
        print("❌ SOME TESTS FAILED! The fix needs investigation.")
    
    sys.exit(0 if success else 1) 