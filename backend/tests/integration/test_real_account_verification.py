#!/usr/bin/env python3
"""
Real Account Verification Test for Enhanced Portfolio Summary

This script tests the enhanced get_portfolio_summary function with a real Alpaca account
to verify that live account equity integration is working correctly.

Expected Results for Account ID: 60205bf6-1d3f-46a5-8a1c-7248ee9210c5
- Total Account Value: ~$162,000+
- Securities Value: ~$35,000 - $43,000
- Cash Balance: ~$119,000+ (difference between total and securities)
"""

import sys
import os
from decimal import Decimal

# Add the project root to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..'))
sys.path.insert(0, project_root)

# Import the enhanced function
from clera_agents.portfolio_management_agent import get_portfolio_summary, broker_client, retrieve_portfolio_positions

def test_real_account_verification():
    """Test with real Alpaca account to verify live data integration."""
    
    # Real account ID provided by user
    test_account_id = "60205bf6-1d3f-46a5-8a1c-7248ee9210c5"
    
    print("="*80)
    print("REAL ACCOUNT VERIFICATION TEST")
    print("="*80)
    print(f"Testing Account ID: {test_account_id}")
    print()
    
    try:
        # Step 1: Get raw account data directly from Alpaca
        print("Step 1: Retrieving raw account data from Alpaca...")
        account = broker_client.get_trade_account_by_id(test_account_id)
        
        raw_cash = Decimal(str(account.cash))
        raw_equity = Decimal(str(account.equity))
        
        print(f"  Raw Cash Balance: ${raw_cash:,.2f}")
        print(f"  Raw Total Equity: ${raw_equity:,.2f}")
        print()
        
        # Step 2: Get positions data
        print("Step 2: Retrieving positions data...")
        
        # Mock the get_account_id to return our test account ID
        from unittest.mock import patch
        
        with patch('clera_agents.portfolio_management_agent.get_account_id') as mock_get_account_id:
            mock_get_account_id.return_value = test_account_id
            positions_data = retrieve_portfolio_positions()
        
        # Calculate total securities value
        total_securities_value = Decimal('0')
        if positions_data:
            print(f"  Found {len(positions_data)} positions:")
            for position in positions_data:
                market_value = Decimal(str(position.market_value))
                total_securities_value += market_value
                print(f"    {position.symbol}: ${market_value:,.2f}")
        else:
            print("  No positions found")
        
        print(f"  Total Securities Value: ${total_securities_value:,.2f}")
        print()
        
        # Step 3: Verify calculations
        print("Step 3: Verifying calculations...")
        calculated_total = raw_cash + total_securities_value
        print(f"  Cash + Securities = ${raw_cash:,.2f} + ${total_securities_value:,.2f} = ${calculated_total:,.2f}")
        print(f"  Alpaca Total Equity: ${raw_equity:,.2f}")
        print(f"  Difference: ${abs(calculated_total - raw_equity):,.2f}")
        
        # Check if calculation matches (allowing for small rounding differences)
        calculation_matches = abs(calculated_total - raw_equity) <= Decimal('1.00')  # Allow $1 difference for rounding
        print(f"  ✅ Calculation Check: {'PASS' if calculation_matches else 'FAIL'}")
        print()
        
        # Step 4: Test the enhanced portfolio summary
        print("Step 4: Testing enhanced get_portfolio_summary function...")
        print("-" * 60)
        
        with patch('clera_agents.portfolio_management_agent.get_account_id') as mock_get_account_id:
            mock_get_account_id.return_value = test_account_id
            
            # Call the enhanced function
            result = get_portfolio_summary.invoke({})
            
            print(result)
            print("-" * 60)
        
        # Step 5: Validate expected ranges
        print("Step 5: Validating against expected ranges...")
        
        # Expected ranges from user
        expected_total_min = Decimal('162000')
        expected_securities_min = Decimal('35000')
        expected_securities_max = Decimal('43000')
        
        print(f"Expected Total Account Value: >= ${expected_total_min:,.2f}")
        print(f"Actual Total Account Value: ${raw_equity:,.2f}")
        total_in_range = raw_equity >= expected_total_min
        print(f"✅ Total Value Check: {'PASS' if total_in_range else 'FAIL'}")
        print()
        
        print(f"Expected Securities Value: ${expected_securities_min:,.2f} - ${expected_securities_max:,.2f}")
        print(f"Actual Securities Value: ${total_securities_value:,.2f}")
        securities_in_range = expected_securities_min <= total_securities_value <= expected_securities_max
        print(f"✅ Securities Value Check: {'PASS' if securities_in_range else 'FAIL'}")
        print()
        
        # Calculate expected cash range
        expected_cash_min = expected_total_min - expected_securities_max
        expected_cash_max = raw_equity - expected_securities_min  # Use actual total for max
        print(f"Expected Cash Range: ${expected_cash_min:,.2f} - ${expected_cash_max:,.2f}")
        print(f"Actual Cash: ${raw_cash:,.2f}")
        cash_in_range = expected_cash_min <= raw_cash <= expected_cash_max
        print(f"✅ Cash Value Check: {'PASS' if cash_in_range else 'FAIL'}")
        print()
        
        # Step 6: Verify the output contains expected elements
        print("Step 6: Verifying output format...")
        
        has_live_section = "LIVE PORTFOLIO VALUE:" in result
        has_total_account = f"${raw_equity:,.2f}" in result
        has_securities_value = f"${total_securities_value:,.2f}" in result
        has_cash_value = f"${raw_cash:,.2f}" in result
        
        print(f"✅ Has LIVE PORTFOLIO VALUE section: {'PASS' if has_live_section else 'FAIL'}")
        print(f"✅ Shows correct total account value: {'PASS' if has_total_account else 'FAIL'}")
        print(f"✅ Shows correct securities value: {'PASS' if has_securities_value else 'FAIL'}")
        print(f"✅ Shows correct cash value: {'PASS' if has_cash_value else 'FAIL'}")
        print()
        
        # Final summary
        all_checks_passed = all([
            calculation_matches,
            total_in_range,
            securities_in_range, 
            cash_in_range,
            has_live_section,
            has_total_account,
            has_securities_value,
            has_cash_value
        ])
        
        print("="*80)
        print("FINAL VERIFICATION RESULT")
        print("="*80)
        print(f"🎯 Overall Test Result: {'✅ ALL CHECKS PASSED' if all_checks_passed else '❌ SOME CHECKS FAILED'}")
        print()
        
        if all_checks_passed:
            print("🚀 The enhanced get_portfolio_summary function is working perfectly!")
            print("   - Live account data retrieval: ✅ WORKING")
            print("   - Cash balance integration: ✅ WORKING") 
            print("   - Securities value calculation: ✅ WORKING")
            print("   - Output format: ✅ WORKING")
            print("   - Math verification: ✅ WORKING")
        else:
            print("⚠️  Some checks failed. Review the output above for details.")
        
        print()
        print("Summary of Values:")
        print(f"  💰 Total Account Value: ${raw_equity:,.2f}")
        print(f"  📈 Securities Value: ${total_securities_value:,.2f}")
        print(f"  💵 Cash Balance: ${raw_cash:,.2f}")
        print(f"  🧮 Cash + Securities: ${calculated_total:,.2f}")
        
        # Save the output to a file for review
        output_dir = os.path.join(current_dir, "portfolio_summary_outputs")
        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, "real_account_verification_output.txt")
        
        with open(output_file, 'w') as f:
            f.write("=== REAL ACCOUNT VERIFICATION TEST ===\n")
            f.write(f"Account ID: {test_account_id}\n")
            f.write(f"Test Date: {os.popen('date').read().strip()}\n\n")
            f.write("RAW ALPACA DATA:\n")
            f.write(f"Cash: ${raw_cash:,.2f}\n")
            f.write(f"Total Equity: ${raw_equity:,.2f}\n")
            f.write(f"Securities Value: ${total_securities_value:,.2f}\n")
            f.write(f"Cash + Securities: ${calculated_total:,.2f}\n\n")
            f.write("ENHANCED PORTFOLIO SUMMARY OUTPUT:\n")
            f.write("="*50 + "\n")
            f.write(result)
            f.write("\n" + "="*50 + "\n")
            f.write(f"\nTest Result: {'PASSED' if all_checks_passed else 'FAILED'}\n")
        
        print(f"\n📁 Detailed output saved to: {output_file}")
        
        return all_checks_passedif __name__ == "__main__":
    success = test_real_account_verification()
    exit(0 if success else 1) 