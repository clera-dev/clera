import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from clera_agents.tools import purchase_history

class TestPurchaseHistoryRefactor(unittest.TestCase):
    def setUp(self):
        # Patch get_account_id to return a fixed account id
        self.account_id = 'test_account_123'
        self.patcher_get_account_id = patch('clera_agents.tools.purchase_history.get_account_id', return_value=self.account_id)
        self.mock_get_account_id = self.patcher_get_account_id.start()
        # Patch get_account_activities to return mock activities
        self.mock_activities = [
            MagicMock(
                activity_type='FILL', symbol='AAPL', transaction_time=datetime.now(timezone.utc) - timedelta(days=1),
                quantity=Decimal('10'), price=Decimal('150.00'), side='buy', net_amount=Decimal('1500.00'), description='Buy 10 shares of AAPL', id='1'
            ),
            MagicMock(
                activity_type='FILL', symbol='MSFT', transaction_time=datetime.now(timezone.utc) - timedelta(days=2),
                quantity=Decimal('5'), price=Decimal('300.00'), side='sell', net_amount=Decimal('-1500.00'), description='Sell 5 shares of MSFT', id='2'
            ),
            MagicMock(
                activity_type='DIV', symbol='AAPL', transaction_time=datetime.now(timezone.utc) - timedelta(days=3),
                quantity=None, price=None, side=None, net_amount=Decimal('5.00'), description='Dividend from AAPL', id='3'
            ),
        ]
        self.patcher_get_account_activities = patch('clera_agents.tools.purchase_history.get_account_activities', return_value=self.mock_activities)
        self.mock_get_account_activities = self.patcher_get_account_activities.start()
        # Patch find_first_purchase_dates to return a mock dict
        self.mock_first_purchases = {'AAPL': datetime.now(timezone.utc) - timedelta(days=100)}
        self.patcher_find_first_purchase_dates = patch('clera_agents.tools.purchase_history.find_first_purchase_dates', return_value=self.mock_first_purchases)
        self.mock_find_first_purchase_dates = self.patcher_find_first_purchase_dates.start()

    def tearDown(self):
        self.patcher_get_account_id.stop()
        self.patcher_get_account_activities.stop()
        self.patcher_find_first_purchase_dates.stop()

    def test_fetch_account_activities_data(self):
        data = purchase_history.fetch_account_activities_data(self.account_id, days_back=10)
        self.assertIn('all_activities', data)
        self.assertIn('trade_activities', data)
        self.assertIn('other_activities', data)
        self.assertIn('first_purchases', data)
        self.assertEqual(len(data['all_activities']), 3)
        self.assertEqual(len(data['trade_activities']), 2)
        self.assertEqual(len(data['other_activities']), 1)
        self.assertEqual(data['first_purchases'], self.mock_first_purchases)

    def test_calculate_account_activity_stats(self):
        data = purchase_history.fetch_account_activities_data(self.account_id, days_back=10)
        stats = purchase_history.calculate_account_activity_stats(data['trade_activities'])
        self.assertEqual(len(stats['buy_trades']), 1)
        self.assertEqual(len(stats['sell_trades']), 1)
        self.assertEqual(len(stats['unique_symbols']), 2)
        self.assertTrue(isinstance(stats['total_volume'], Decimal))

    def test_format_account_activities_report(self):
        data = purchase_history.fetch_account_activities_data(self.account_id, days_back=10)
        stats = purchase_history.calculate_account_activity_stats(data['trade_activities'])
        report = purchase_history.format_account_activities_report(
            all_activities=data['all_activities'],
            trade_activities=data['trade_activities'],
            other_activities=data['other_activities'],
            first_purchases=data['first_purchases'],
            stats=stats,
            days_back=data['days_back']
        )
        self.assertIn('Account Activities Report', report)
        self.assertIn('AAPL', report)
        self.assertIn('MSFT', report)
        self.assertIn('Dividend from AAPL', report)
        self.assertIn('First Purchase Dates', report)

    def test_get_comprehensive_account_activities(self):
        # This is the main orchestration function
        report = purchase_history.get_comprehensive_account_activities(days_back=10, config=None)
        self.assertIn('Account Activities Report', report)
        self.assertIn('AAPL', report)
        self.assertIn('MSFT', report)
        self.assertIn('Dividend from AAPL', report)
        self.assertIn('First Purchase Dates', report)

if __name__ == '__main__':
    unittest.main() 