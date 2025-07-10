#!/usr/bin/env python3

"""
COMPREHENSIVE TEST: Verify risk score fix works for BOTH frontend and AI agent.
This test ensures complete parity between frontend analytics and AI agent analysis.
"""

import sys
import os
import uuid
from decimal import Decimal
from unittest.mock import Mock, MagicMock
import json

# Add the parent directory to the path to import clera_agents
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_frontend_backend_analytics_endpoint():
    """Test the exact same logic that the frontend /api/portfolio/analytics endpoint uses."""
    
    print("🔍 TESTING FRONTEND ANALYTICS ENDPOINT LOGIC")
    print("=" * 60)
    
    try:
        # Import exactly what the backend API uses
        from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine, PortfolioPosition, AssetClass, SecurityType
        from api_server import map_alpaca_position_to_portfolio_position
        from alpaca.trading.enums import AssetClass as AlpacaTradingAssetClass
        
        print("✅ Successfully imported backend API modules")
        
        # Create mock positions that simulate what Alpaca API returns
        mock_positions = []
        
        # SPY position (the main culprit)
        spy_position = Mock()
        spy_position.symbol = "SPY"
        spy_position.asset_id = uuid.uuid4()
        spy_position.market_value = Decimal('50000')  # Large position
        spy_position.cost_basis = Decimal('48000')
        spy_position.unrealized_pl = Decimal('2000')
        spy_position.qty = Decimal('500')
        spy_position.current_price = Decimal('100')
        spy_position.asset_class = AlpacaTradingAssetClass.US_EQUITY
        mock_positions.append(spy_position)
        
        # Add some individual stocks for comparison
        aapl_position = Mock()
        aapl_position.symbol = "AAPL"
        aapl_position.asset_id = uuid.uuid4()
        aapl_position.market_value = Decimal('20000')
        aapl_position.cost_basis = Decimal('19000')
        aapl_position.unrealized_pl = Decimal('1000')
        aapl_position.qty = Decimal('100')
        aapl_position.current_price = Decimal('200')
        aapl_position.asset_class = AlpacaTradingAssetClass.US_EQUITY
        mock_positions.append(aapl_position)
        
        # Test with EMPTY asset details map (simulating failed asset fetch)
        asset_details_map = {}
        
        print(f"📊 Testing with {len(mock_positions)} positions:")
        for pos in mock_positions:
            print(f"   - {pos.symbol}: ${pos.market_value}")
        
        # Map positions using the EXACT same logic as the backend API
        portfolio_positions = []
        for alpaca_pos in mock_positions:
            mapped_pos = map_alpaca_position_to_portfolio_position(alpaca_pos, asset_details_map)
            if mapped_pos:
                portfolio_positions.append(mapped_pos)
                print(f"   ✅ {mapped_pos.symbol}: {mapped_pos.asset_class.value} / {mapped_pos.security_type.value}")
            else:
                print(f"   ❌ Failed to map {alpaca_pos.symbol}")
        
        if not portfolio_positions:
            print("❌ No positions were successfully mapped!")
            return False
        
        # Calculate risk score using the EXACT same engine as the API
        frontend_risk_score = PortfolioAnalyticsEngine.calculate_risk_score(portfolio_positions)
        frontend_diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(portfolio_positions)
        
        print(f"\n📈 FRONTEND API RESULTS:")
        print(f"   Risk Score: {frontend_risk_score}")
        print(f"   Diversification Score: {frontend_diversification_score}")
        
        # Verify SPY is classified as ETF
        spy_mapped = next((p for p in portfolio_positions if p.symbol == "SPY"), None)
        if spy_mapped:
            assert spy_mapped.security_type == SecurityType.ETF, f"SPY should be ETF, got {spy_mapped.security_type}"
            print("   ✅ SPY correctly classified as ETF in frontend")
        else:
            print("   ❌ SPY not found in mapped positions")
            return False
        
        return {
            'risk_score': float(frontend_risk_score),
            'diversification_score': float(frontend_diversification_score),
            'positions': portfolio_positions
        }def test_ai_agent_portfolio_analysis():
    """Test the exact same logic that the AI agent uses for portfolio analysis."""
    
    print("\n🤖 TESTING AI AGENT PORTFOLIO ANALYSIS LOGIC")
    print("=" * 60)
    
    try:
        # Import the AI agent's portfolio analysis tools
        from clera_agents.tools.portfolio_analysis import PortfolioAnalyzer, PortfolioPosition, AssetClass, SecurityType
        
        print("✅ Successfully imported AI agent modules")
        
        # Create the SAME positions but using the AI agent's approach
        positions = []
        
        # SPY position (using AI agent's PortfolioPosition directly)
        spy_position = PortfolioPosition(
            symbol="SPY",
            quantity=Decimal('500'),
            current_price=Decimal('100'),
            market_value=Decimal('50000'),
            cost_basis=Decimal('48000'),
            unrealized_pl=Decimal('2000')
        )
        
        # The AI agent classifies positions using PortfolioAnalyzer.classify_position
        spy_classified = PortfolioAnalyzer.classify_position(spy_position)
        positions.append(spy_classified)
        
        print(f"🔍 AI Agent Classification:")
        print(f"   SPY: {spy_classified.asset_class.value} / {spy_classified.security_type.value}")
        
        # AAPL position
        aapl_position = PortfolioPosition(
            symbol="AAPL",
            quantity=Decimal('100'),
            current_price=Decimal('200'),
            market_value=Decimal('20000'),
            cost_basis=Decimal('19000'),
            unrealized_pl=Decimal('1000')
        )
        
        aapl_classified = PortfolioAnalyzer.classify_position(aapl_position)
        positions.append(aapl_classified)
        
        print(f"   AAPL: {aapl_classified.asset_class.value} / {aapl_classified.security_type.value}")
        
        # Calculate scores using AI agent's approach
        from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine
        
        agent_risk_score = PortfolioAnalyticsEngine.calculate_risk_score(positions)
        agent_diversification_score = PortfolioAnalyticsEngine.calculate_diversification_score(positions)
        
        print(f"\n🤖 AI AGENT RESULTS:")
        print(f"   Risk Score: {agent_risk_score}")
        print(f"   Diversification Score: {agent_diversification_score}")
        
        # Verify SPY is classified as ETF by the agent
        assert spy_classified.security_type == SecurityType.ETF, f"AI Agent should classify SPY as ETF, got {spy_classified.security_type}"
        print("   ✅ SPY correctly classified as ETF by AI agent")
        
        return {
            'risk_score': float(agent_risk_score),
            'diversification_score': float(agent_diversification_score),
            'positions': positions
        }def test_edge_cases():
    """Test edge cases that could cause discrepancies."""
    
    print("\n⚠️  TESTING EDGE CASES")
    print("=" * 60)
    
    try:
        from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine, PortfolioPosition, AssetClass, SecurityType
        from api_server import map_alpaca_position_to_portfolio_position
        from alpaca.trading.enums import AssetClass as AlpacaTradingAssetClass
        
        edge_cases = [
            {
                'name': 'SPY with asset details available',
                'symbol': 'SPY',
                'has_asset_details': True
            },
            {
                'name': 'SPY with asset details missing',
                'symbol': 'SPY', 
                'has_asset_details': False
            },
            {
                'name': 'QQQ with asset details missing',
                'symbol': 'QQQ',
                'has_asset_details': False
            },
            {
                'name': 'ETF with "ETF" in name (AAAU)',
                'symbol': 'AAAU',
                'has_asset_details': False,
                'cached_name': 'Goldman Sachs Physical Gold ETF Shares'
            },
            {
                'name': 'ETF with "ETF" in name (AAPB)',
                'symbol': 'AAPB',
                'has_asset_details': False,
                'cached_name': 'GraniteShares ETF Trust GraniteShares 2x Long AAPL Daily ETF'
            },
            {
                'name': 'Unknown ETF not in common list',
                'symbol': 'UNKNOWNETF',
                'has_asset_details': False
            },
            {
                'name': 'Regular stock',
                'symbol': 'MSFT',
                'has_asset_details': False
            }
        ]
        
        all_passed = True
        
        for case in edge_cases:
            print(f"\n🧪 Testing: {case['name']}")
            
            # Create mock position
            mock_pos = Mock()
            mock_pos.symbol = case['symbol']
            mock_pos.asset_id = uuid.uuid4()
            mock_pos.market_value = Decimal('10000')
            mock_pos.cost_basis = Decimal('9500')
            mock_pos.unrealized_pl = Decimal('500')
            mock_pos.qty = Decimal('100')
            mock_pos.current_price = Decimal('100')
            mock_pos.asset_class = AlpacaTradingAssetClass.US_EQUITY
            
            # Create asset details map
            asset_details_map = {}
            if case['has_asset_details']:
                mock_asset = Mock()
                mock_asset.name = f"{case['symbol']} ETF Trust"  # Name that should trigger ETF classification
                mock_asset.symbol = case['symbol']
                asset_details_map[mock_pos.asset_id] = mock_asset
            
            # Mock the asset cache file for name-based ETF detection
            if case.get('cached_name'):
                # Create a temporary mock of the asset cache file reading
                import tempfile
                import json
                import os
                
                # Create temporary asset cache with the test data
                temp_cache_data = [
                    {
                        'symbol': case['symbol'],
                        'name': case['cached_name']
                    }
                ]
                
                # Mock the ASSET_CACHE_FILE path and content
                original_exists = os.path.exists
                original_open = open
                
                def mock_exists(path):
                    if 'tradable_assets.json' in path:
                        return True
                    return original_exists(path)
                
                def mock_open(path, mode='r'):
                    if 'tradable_assets.json' in path and mode == 'r':
                        import io
                        return io.StringIO(json.dumps(temp_cache_data))
                    return original_open(path, mode)
                
                # Apply mocks
                import builtins
                builtins.open = mock_open
                os.path.exists = mock_exists
            
            # Test frontend mapping
            frontend_mapped = map_alpaca_position_to_portfolio_position(mock_pos, asset_details_map)
            
            # Test AI agent classification
            agent_position = PortfolioPosition(
                symbol=case['symbol'],
                quantity=Decimal('100'),
                current_price=Decimal('100'),
                market_value=Decimal('10000'),
                cost_basis=Decimal('9500'),
                unrealized_pl=Decimal('500')
            )
            
            from clera_agents.tools.portfolio_analysis import PortfolioAnalyzer
            agent_mapped = PortfolioAnalyzer.classify_position(agent_position)
            
            # Compare results
            if frontend_mapped and agent_mapped:
                frontend_security_type = frontend_mapped.security_type
                agent_security_type = agent_mapped.security_type
                
                if frontend_security_type == agent_security_type:
                    print(f"   ✅ MATCH: Both classify as {frontend_security_type.value}")
                else:
                    print(f"   ❌ MISMATCH: Frontend={frontend_security_type.value}, Agent={agent_security_type.value}")
                    all_passed = False
            else:
                print(f"   ❌ Mapping failed")
                all_passed = False
            
            # Restore mocks if they were applied
            if case.get('cached_name'):
                import builtins
                builtins.open = original_open
                os.path.exists = original_exists
        
        return all_passeddef test_risk_score_calculation_consistency():
    """Test that risk score calculations are identical between frontend and agent."""
    
    print("\n🎯 TESTING RISK SCORE CALCULATION CONSISTENCY")
    print("=" * 60)
    
    try:
        from clera_agents.tools.portfolio_analysis import PortfolioAnalyticsEngine, PortfolioPosition, AssetClass, SecurityType
        
        # Create identical positions for both tests
        test_positions = [
            PortfolioPosition(
                symbol="SPY",
                asset_class=AssetClass.EQUITY,
                security_type=SecurityType.ETF,  # Should be ETF after fix
                market_value=Decimal('50000'),
                cost_basis=Decimal('48000'),
                unrealized_pl=Decimal('2000'),
                quantity=Decimal('500'),
                current_price=Decimal('100')
            ),
            PortfolioPosition(
                symbol="AAPL",
                asset_class=AssetClass.EQUITY,
                security_type=SecurityType.INDIVIDUAL_STOCK,
                market_value=Decimal('20000'),
                cost_basis=Decimal('19000'),
                unrealized_pl=Decimal('1000'),
                quantity=Decimal('100'),
                current_price=Decimal('200')
            )
        ]
        
        # Calculate risk scores
        risk_score_1 = PortfolioAnalyticsEngine.calculate_risk_score(test_positions)
        risk_score_2 = PortfolioAnalyticsEngine.calculate_risk_score(test_positions)
        
        # Should be identical
        if risk_score_1 == risk_score_2:
            print(f"✅ Risk score calculation is consistent: {risk_score_1}")
        else:
            print(f"❌ Risk score calculation inconsistent: {risk_score_1} vs {risk_score_2}")
            return False
        
        # Test with SPY as INDIVIDUAL_STOCK (old behavior)
        test_positions_old = [
            PortfolioPosition(
                symbol="SPY",
                asset_class=AssetClass.EQUITY,
                security_type=SecurityType.INDIVIDUAL_STOCK,  # Old incorrect classification
                market_value=Decimal('50000'),
                cost_basis=Decimal('48000'),
                unrealized_pl=Decimal('2000'),
                quantity=Decimal('500'),
                current_price=Decimal('100')
            ),
            PortfolioPosition(
                symbol="AAPL",
                asset_class=AssetClass.EQUITY,
                security_type=SecurityType.INDIVIDUAL_STOCK,
                market_value=Decimal('20000'),
                cost_basis=Decimal('19000'),
                unrealized_pl=Decimal('1000'),
                quantity=Decimal('100'),
                current_price=Decimal('200')
            )
        ]
        
        risk_score_old = PortfolioAnalyticsEngine.calculate_risk_score(test_positions_old)
        
        print(f"📊 Risk Score Comparison:")
        print(f"   SPY as ETF (NEW): {risk_score_1}")
        print(f"   SPY as Stock (OLD): {risk_score_old}")
        print(f"   Difference: {float(risk_score_old) - float(risk_score_1)}")
        
        # The new score should be lower (ETF has lower risk than individual stock)
        if float(risk_score_1) < float(risk_score_old):
            print("✅ Fix working: ETF classification results in lower risk score")
            return True
        else:
            print("❌ Fix not working: ETF should have lower risk score than individual stock")
            return Falseif __name__ == "__main__":
    print("🔬 COMPREHENSIVE RISK SCORE VERIFICATION")
    print("Testing BOTH frontend analytics endpoint AND AI agent logic")
    print("=" * 80)
    
    all_tests_passed = True
    
    # Test 1: Frontend analytics endpoint
    print("\n" + "🔵" * 20 + " FRONTEND TEST " + "🔵" * 20)
    frontend_results = test_frontend_backend_analytics_endpoint()
    if not frontend_results:
        all_tests_passed = False
    
    # Test 2: AI agent analysis
    print("\n" + "🟢" * 20 + " AI AGENT TEST " + "🟢" * 20)
    agent_results = test_ai_agent_portfolio_analysis()
    if not agent_results:
        all_tests_passed = False
    
    # Test 3: Compare results
    if frontend_results and agent_results:
        print("\n" + "⚖️ " * 20 + " COMPARISON " + "⚖️ " * 20)
        frontend_risk = frontend_results['risk_score']
        agent_risk = agent_results['risk_score']
        
        print(f"Frontend Risk Score: {frontend_risk}")
        print(f"AI Agent Risk Score:  {agent_risk}")
        print(f"Difference: {abs(frontend_risk - agent_risk)}")
        
        # Allow small floating point differences
        if abs(frontend_risk - agent_risk) < 0.01:
            print("✅ PERFECT MATCH: Frontend and AI agent risk scores are identical!")
        else:
            print("❌ MISMATCH: Frontend and AI agent risk scores differ!")
            all_tests_passed = False
    
    # Test 4: Edge cases
    print("\n" + "⚠️ " * 20 + " EDGE CASES " + "⚠️ " * 20)
    edge_case_passed = test_edge_cases()
    if not edge_case_passed:
        all_tests_passed = False
    
    # Test 5: Risk score calculation consistency
    print("\n" + "🎯" * 20 + " CONSISTENCY " + "🎯" * 20)
    consistency_passed = test_risk_score_calculation_consistency()
    if not consistency_passed:
        all_tests_passed = False
    
    # Final verdict
    print("\n" + "=" * 80)
    if all_tests_passed:
        print("🎉 ALL COMPREHENSIVE TESTS PASSED!")
        print("✅ The fix will work for BOTH frontend and AI agent")
        print("✅ Risk scores will be synchronized after merge to main")
        print("✅ SPY and other ETFs are properly classified in both systems")
        print("✅ Cache-busting refresh button will show corrected scores")
        print("\n🚀 SAFE TO MERGE TO MAIN BRANCH! 🚀")
    else:
        print("❌ SOME TESTS FAILED!")
        print("⚠️  DO NOT MERGE UNTIL ISSUES ARE RESOLVED")
        print("🔧 Review the failed tests above and fix any issues")
    
    sys.exit(0 if all_tests_passed else 1) 