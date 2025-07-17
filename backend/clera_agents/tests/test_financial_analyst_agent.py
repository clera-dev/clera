import unittest
from datetime import datetime, timedelta
import os
import sys

# Ensure the parent directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from clera_agents.financial_analyst_agent import calculate_investment_performance, get_historical_prices, calculate_volatility_and_variance

class TestFinancialAnalystAgentIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Check for FMP API key
        cls.api_key = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
        if not cls.api_key:
            raise unittest.SkipTest("FINANCIAL_MODELING_PREP_API_KEY not set in environment.")

    def test_aapl_6_months_performance_and_volatility(self):
        symbol = "AAPL"
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=182)).strftime('%Y-%m-%d')  # ~6 months

        # Get historical prices (real API call)
        data = get_historical_prices(symbol, start_date, end_date, return_full_data=True)
        self.assertIn('full_price_data', data)
        self.assertGreater(len(data['full_price_data']), 20)  # Should have at least 20 trading days

        # Calculate volatility/variance
        stats = calculate_volatility_and_variance(data['full_price_data'])
        self.assertIsNotNone(stats['volatility'])
        self.assertIsNotNone(stats['variance'])
        self.assertIsNotNone(stats['annualized_volatility'])
        self.assertGreater(stats['annualized_volatility'], 0)

        # Print for manual inspection
        print("AAPL 6mo Volatility:", stats)

        # Test the full performance tool output
        from clera_agents.financial_analyst_agent import _calculate_investment_performance_impl
        result = _calculate_investment_performance_impl(symbol, start_date, end_date, compare_to_sp500=True)
        print("AAPL 6mo Performance Output:\n", result)
        self.assertIn("Volatility", result)
        self.assertIn("Annualized Volatility", result)
        self.assertIn("Performance Analysis", result)
        self.assertIn("SPY", result)  # Should include benchmark

    def test_start_end_on_weekend_single_day(self):
        symbol = "AAPL"
        # Both dates on the same weekend, should adjust to the same previous trading day
        start_date = "2025-07-12"  # Saturday
        end_date = "2025-07-13"    # Sunday
        from clera_agents.financial_analyst_agent import _calculate_investment_performance_impl
        result = _calculate_investment_performance_impl(symbol, start_date, end_date, compare_to_sp500=False)
        print("Weekend single-day edge case output:\n", result)
        self.assertIn("only includes a single trading day", result)
        self.assertIn("Please select a wider range", result)

    def test_start_end_on_weekend_valid_range(self):
        symbol = "AAPL"
        # Saturday to Tuesday, should adjust both backwards to Friday and Tuesday
        start_date = "2025-07-12"  # Saturday
        end_date = "2025-07-15"    # Tuesday
        from clera_agents.financial_analyst_agent import _calculate_investment_performance_impl
        result = _calculate_investment_performance_impl(symbol, start_date, end_date, compare_to_sp500=False)
        print("Weekend valid range edge case output:\n", result)
        self.assertIn("Performance Analysis", result)
        self.assertIn("Price Performance", result)
        self.assertNotIn("Error", result)

    def test_very_short_period(self):
        symbol = "AAPL"
        # 2 consecutive trading days
        start_date = "2025-07-10"
        end_date = "2025-07-11"
        from clera_agents.financial_analyst_agent import _calculate_investment_performance_impl
        result = _calculate_investment_performance_impl(symbol, start_date, end_date, compare_to_sp500=False)
        print("Short period output:\n", result)
        self.assertIn("Performance Analysis", result)
        self.assertIn("Price Performance", result)
        self.assertNotIn("Error", result)

    def test_no_data_available(self):
        symbol = "AAPL"
        # Use a date range far in the past or future
        start_date = "1900-01-01"
        end_date = "1900-01-10"
        from clera_agents.financial_analyst_agent import _calculate_investment_performance_impl
        result = _calculate_investment_performance_impl(symbol, start_date, end_date, compare_to_sp500=False)
        print("No data available output:\n", result)
        self.assertIn("Error", result)

    def test_future_end_date(self):
        symbol = "AAPL"
        start_date = "2025-01-01"
        # End date 1 year in the future
        from datetime import datetime, timedelta
        future_date = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
        from clera_agents.financial_analyst_agent import _calculate_investment_performance_impl
        result = _calculate_investment_performance_impl(symbol, start_date, future_date, compare_to_sp500=False)
        print("Future end date output:\n", result)
        self.assertIn("Error", result)

if __name__ == "__main__":
    unittest.main() 