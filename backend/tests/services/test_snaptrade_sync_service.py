"""
Tests for SnapTrade Sync Service

Validates that holdings are correctly synced from SnapTrade to aggregated_holdings table.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from decimal import Decimal

from utils.portfolio.snaptrade_sync_service import (
    SnapTradeSyncService,
    trigger_account_sync,
    trigger_full_user_sync
)
from utils.portfolio.abstract_provider import Position


class TestSnapTradeSyncService:
    """Test suite for SnapTrade sync service."""
    
    @pytest.mark.asyncio
    async def test_sync_user_portfolio_success(self):
        """Test successful full portfolio sync."""
        service = SnapTradeSyncService()
        
        # Mock positions
        mock_positions = [
            Position(
                symbol='AAPL',
                security_name='Apple Inc',
                security_type='equity',
                quantity=Decimal('10'),
                market_value=Decimal('1500'),
                cost_basis=Decimal('1400'),
                price=Decimal('150'),
                unrealized_pl=Decimal('100'),
                account_id='snaptrade_acc_123',
                institution_name='Test Broker',
                universal_symbol_id='sym_123'
            )
        ]
        
        with patch.object(service.provider, 'get_positions') as mock_get_positions, \
             patch.object(service, '_upsert_aggregated_holding') as mock_upsert:
            
            mock_get_positions.return_value = mock_positions
            mock_upsert.return_value = None
            
            result = await service.sync_user_portfolio('test_user')
            
            assert result['success'] is True
            assert result['positions_synced'] == 1
            assert 'timestamp' in result
            mock_upsert.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_sync_specific_account(self):
        """Test syncing specific account."""
        service = SnapTradeSyncService()
        
        mock_positions = [
            Position(
                symbol='TSLA',
                security_name='Tesla Inc',
                security_type='equity',
                quantity=Decimal('5'),
                market_value=Decimal('1000'),
                cost_basis=Decimal('900'),
                price=Decimal('200'),
                unrealized_pl=Decimal('100'),
                account_id='snaptrade_acc_456',
                institution_name='Test Broker',
                universal_symbol_id='sym_456'
            )
        ]
        
        mock_existing = Mock()
        mock_existing.data = []
        
        with patch.object(service.provider, 'get_positions') as mock_get_positions, \
             patch.object(service.supabase.table('user_aggregated_holdings'), 'select') as mock_select, \
             patch.object(service, '_update_position_in_aggregated') as mock_update:
            
            mock_get_positions.return_value = mock_positions
            mock_select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_existing
            mock_update.return_value = None
            
            result = await service.sync_specific_account('test_user', 'snaptrade_acc_456')
            
            assert result['success'] is True
            assert result['positions_synced'] == 1
            mock_update.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_trigger_account_sync_convenience_function(self):
        """Test the convenience function for account sync."""
        with patch('utils.portfolio.snaptrade_sync_service.get_snaptrade_sync_service') as mock_get_service:
            mock_service = Mock()
            mock_service.sync_specific_account = AsyncMock(return_value={'success': True})
            mock_get_service.return_value = mock_service
            
            result = await trigger_account_sync('user_123', 'acc_456')
            
            assert result['success'] is True
            mock_service.sync_specific_account.assert_called_once_with('user_123', 'acc_456')
    
    @pytest.mark.asyncio
    async def test_trigger_full_user_sync_convenience_function(self):
        """Test the convenience function for full user sync."""
        with patch('utils.portfolio.snaptrade_sync_service.get_snaptrade_sync_service') as mock_get_service:
            mock_service = Mock()
            mock_service.sync_user_portfolio = AsyncMock(return_value={'success': True, 'positions_synced': 5})
            mock_get_service.return_value = mock_service
            
            result = await trigger_full_user_sync('user_123', force_rebuild=True)
            
            assert result['success'] is True
            assert result['positions_synced'] == 5
            mock_service.sync_user_portfolio.assert_called_once_with('user_123', force_full=True)
    
    @pytest.mark.asyncio
    async def test_sync_aggregates_multiple_accounts(self):
        """Test that sync correctly aggregates holdings across multiple accounts."""
        service = SnapTradeSyncService()
        
        # Same symbol held in 2 different accounts
        mock_positions = [
            Position(
                symbol='AAPL',
                security_name='Apple Inc',
                security_type='equity',
                quantity=Decimal('10'),
                market_value=Decimal('1500'),
                cost_basis=Decimal('1400'),
                price=Decimal('150'),
                unrealized_pl=Decimal('100'),
                account_id='snaptrade_acc_1',
                institution_name='Broker A',
                universal_symbol_id='sym_123'
            ),
            Position(
                symbol='AAPL',
                security_name='Apple Inc',
                security_type='equity',
                quantity=Decimal('5'),
                market_value=Decimal('750'),
                cost_basis=Decimal('700'),
                price=Decimal('150'),
                unrealized_pl=Decimal('50'),
                account_id='snaptrade_acc_2',
                institution_name='Broker B',
                universal_symbol_id='sym_123'
            )
        ]
        
        with patch.object(service.provider, 'get_positions') as mock_get_positions, \
             patch.object(service, '_upsert_aggregated_holding') as mock_upsert:
            
            mock_get_positions.return_value = mock_positions
            mock_upsert.return_value = None
            
            result = await service.sync_user_portfolio('test_user')
            
            # Should create 1 aggregated holding (same symbol)
            assert result['success'] is True
            assert result['positions_synced'] == 1
            
            # Check the aggregated data passed to upsert
            call_args = mock_upsert.call_args[0]
            symbol_data = call_args[2]
            
            assert symbol_data['total_quantity'] == Decimal('15')  # 10 + 5
            assert symbol_data['total_market_value'] == Decimal('2250')  # 1500 + 750
            assert len(symbol_data['positions']) == 2


class TestWebhookSecurity:
    """Test webhook security functions."""
    
    def test_webhook_signature_verification(self):
        """Test webhook signature verification."""
        from utils.snaptrade_webhook_security import verify_webhook_signature
        import hmac
        import hashlib
        import json
        
        # Mock webhook secret
        webhook_secret = 'test_secret_123'
        payload = {'type': 'ACCOUNT_HOLDINGS_UPDATED', 'userId': 'user_123', 'accountId': 'acc_456'}
        
        # Generate correct signature
        payload_string = json.dumps(payload, separators=(',', ':'), sort_keys=True)
        correct_signature = hmac.new(
            webhook_secret.encode('utf-8'),
            payload_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        with patch.dict('os.environ', {'SNAPTRADE_WEBHOOK_SECRET': webhook_secret}):
            # Test with correct signature
            assert verify_webhook_signature(payload, correct_signature) is True
            
            # Test with incorrect signature
            assert verify_webhook_signature(payload, 'wrong_signature') is False
    
    def test_webhook_payload_validation(self):
        """Test webhook payload validation."""
        from utils.snaptrade_webhook_security import validate_webhook_payload
        
        # Valid payload
        valid_payload = {
            'type': 'ACCOUNT_HOLDINGS_UPDATED',
            'userId': 'user_123',
            'accountId': 'acc_456'
        }
        assert validate_webhook_payload(valid_payload) is True
        
        # Missing type
        invalid_payload_1 = {
            'userId': 'user_123',
            'accountId': 'acc_456'
        }
        assert validate_webhook_payload(invalid_payload_1) is False
        
        # Missing required field
        invalid_payload_2 = {
            'type': 'ACCOUNT_HOLDINGS_UPDATED',
            'userId': 'user_123'
            # Missing accountId
        }
        assert validate_webhook_payload(invalid_payload_2) is False


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

