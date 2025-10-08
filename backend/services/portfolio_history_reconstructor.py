"""
Portfolio History Reconstructor

The core engine for reconstructing complete portfolio history from Plaid transaction data.
This is the heart of Phase 1 - providing immediate 2-year historical portfolio tracking.

Algorithm Overview:
1. Get current holdings from Plaid (end state)
2. Get 24 months of investment transactions from Plaid
3. Map all securities to FMP-compatible symbols
4. Batch fetch historical prices for entire timeline
5. Work backwards day by day, applying transactions in reverse
6. Calculate portfolio value for each day using historical prices
7. Store complete timeline permanently in database

Designed for production scale with comprehensive error handling.
"""

import asyncio
import logging
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date, timedelta
from dataclasses import dataclass
from decimal import Decimal

logger = logging.getLogger(__name__)

@dataclass
class PortfolioSnapshot:
    """Single day portfolio snapshot."""
    date: date
    total_value: float
    total_cost_basis: float
    total_gain_loss: float
    total_gain_loss_percent: float
    securities_count: int
    account_breakdown: Dict[str, float]
    institution_breakdown: Dict[str, float]
    data_quality_score: float

@dataclass
class ReconstructionResult:
    """Result of portfolio reconstruction operation."""
    user_id: str
    success: bool
    timeline: List[PortfolioSnapshot]
    start_date: date
    end_date: date
    total_data_points: int
    securities_processed: int
    transactions_processed: int
    api_calls_made: int
    api_cost_estimate: float
    processing_duration_seconds: float
    error: Optional[str] = None

class PortfolioHistoryReconstructor:
    """
    Production-grade portfolio history reconstruction engine.
    
    Transforms Plaid transaction history into complete portfolio timeline
    using external price data and sophisticated transaction processing.
    """
    
    def __init__(self):
        """Initialize the reconstruction engine."""
        self.symbol_mapping_service = None  # Lazy loaded
        self.historical_price_service = None  # Lazy loaded
        self.plaid_provider = None  # Lazy loaded
        self.supabase = None  # Lazy loaded
        
        # Performance tracking
        self.total_api_calls = 0
        self.total_cost_estimate = 0.0
    
    def _get_services(self):
        """Lazy load all required services."""
        if self.symbol_mapping_service is None:
            from services.symbol_mapping_service import get_symbol_mapping_service
            self.symbol_mapping_service = get_symbol_mapping_service()
        
        if self.historical_price_service is None:
            from services.historical_price_service import get_historical_price_service
            self.historical_price_service = get_historical_price_service()
        
        if self.plaid_provider is None:
            from utils.portfolio.plaid_provider import PlaidPortfolioProvider
            self.plaid_provider = PlaidPortfolioProvider()
        
        if self.supabase is None:
            from utils.supabase.db_client import get_supabase_client
            self.supabase = get_supabase_client()
    
    def _get_supabase_client(self):
        """Get Supabase client (ensure compatibility with existing code)."""
        self._get_services()
        return self.supabase
    
    async def reconstruct_user_portfolio_history(self, user_id: str) -> ReconstructionResult:
        """
        Master reconstruction algorithm for a single user.
        
        This is the main public interface for portfolio history reconstruction.
        Provides complete 2-year portfolio history within 3 minutes.
        
        Args:
            user_id: User to reconstruct portfolio history for
            
        Returns:
            ReconstructionResult with complete operation details
        """
        start_time = datetime.now()
        
        try:
            # Initialize services
            self._get_services()
            
            # Update reconstruction status
            await self._update_reconstruction_status(user_id, 'in_progress', 0.0)
            
            logger.info(f"🚀 Starting portfolio reconstruction for user {user_id}")
            
            # Step 1: Get current holdings (end state) - 10% progress
            current_holdings = await self._get_current_plaid_holdings(user_id)
            await self._update_reconstruction_status(user_id, 'in_progress', 10.0)
            logger.info(f"📊 Current holdings: {len(current_holdings)} securities")
            
            # Step 2: Get investment transaction history - 20% progress  
            transactions = await self._get_plaid_transaction_history(user_id)
            await self._update_reconstruction_status(user_id, 'in_progress', 20.0)
            logger.info(f"📈 Transaction history: {len(transactions)} transactions over 24 months")
            
            # Step 3: Map securities to FMP symbols - 30% progress
            all_securities = self._extract_unique_securities(current_holdings, transactions)
            mapping_stats = await self.symbol_mapping_service.map_securities_for_user(all_securities)
            await self._update_reconstruction_status(user_id, 'in_progress', 30.0)
            logger.info(f"🔗 Security mapping: {mapping_stats.mapped_successfully}/{mapping_stats.total_securities} mapped")
            
            # Get successful mappings for price fetching
            symbol_mapping = await self._get_successful_mappings(all_securities)
            
            # Step 4: Batch fetch historical prices - 60% progress
            start_date = datetime.now().date() - timedelta(days=730)  # 2 years
            end_date = datetime.now().date()
            
            fmp_symbols = list(symbol_mapping.values())
            price_stats = await self.historical_price_service.fetch_historical_prices_batch(
                fmp_symbols, start_date, end_date
            )
            await self._update_reconstruction_status(user_id, 'in_progress', 60.0)
            logger.info(f"💰 Historical prices: {price_stats.successful_symbols} symbols, ~${price_stats.api_cost_estimate:.2f} cost")
            
            # Step 5: Core reconstruction algorithm - 90% progress
            portfolio_timeline = await self._reconstruct_daily_timeline(
                user_id, current_holdings, transactions, symbol_mapping, start_date, end_date
            )
            await self._update_reconstruction_status(user_id, 'in_progress', 90.0)
            logger.info(f"📅 Timeline: {len(portfolio_timeline)} daily portfolio values")
            
            # Step 6: Store timeline permanently - 100% progress
            await self._store_reconstructed_timeline(user_id, portfolio_timeline)
            await self._update_reconstruction_status(user_id, 'completed', 100.0)
            
            # Calculate final statistics
            duration = (datetime.now() - start_time).total_seconds()
            
            logger.info(f"✅ Reconstruction complete for user {user_id} in {duration:.1f}s")
            
            return ReconstructionResult(
                user_id=user_id,
                success=True,
                timeline=portfolio_timeline,
                start_date=start_date,
                end_date=end_date,
                total_data_points=len(portfolio_timeline),
                securities_processed=mapping_stats.mapped_successfully,
                transactions_processed=len(transactions),
                api_calls_made=mapping_stats.api_calls_made + price_stats.api_calls_made,
                api_cost_estimate=price_stats.api_cost_estimate,
                processing_duration_seconds=duration
            )
            
        except Exception as e:
            # Mark reconstruction as failed
            await self._update_reconstruction_status(user_id, 'failed', 0.0, str(e))
            
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(f"❌ Reconstruction failed for user {user_id} after {duration:.1f}s: {e}")
            
            return ReconstructionResult(
                user_id=user_id,
                success=False,
                timeline=[],
                start_date=date.today(),
                end_date=date.today(),
                total_data_points=0,
                securities_processed=0,
                transactions_processed=0,
                api_calls_made=0,
                api_cost_estimate=0.0,
                processing_duration_seconds=duration,
                error=str(e)
            )
    
    async def _get_current_plaid_holdings(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get current holdings from Plaid as the end state for reconstruction.
        """
        try:
            # Use existing Plaid provider to get current holdings
            positions = await self.plaid_provider.get_positions(user_id)
            
            # Convert to dictionaries for processing
            holdings = []
            for position in positions:
                holding = {
                    'security_id': getattr(position, 'security_id', position.symbol),  # May need adjustment
                    'symbol': position.symbol,
                    'security_name': getattr(position, 'security_name', position.symbol),
                    'security_type': getattr(position, 'security_type', 'equity'),
                    'quantity': float(position.quantity),
                    'market_value': float(position.market_value),
                    'cost_basis': float(position.cost_basis),
                    'account_id': position.account_id,
                    'institution_name': getattr(position, 'institution_name', 'Unknown')
                }
                holdings.append(holding)
            
            return holdings
            
        except Exception as e:
            logger.error(f"Error getting current Plaid holdings for user {user_id}: {e}")
            return []
    
    async def _get_plaid_transaction_history(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get complete investment transaction history from Plaid (24 months max).
        """
        try:
            # Use existing Plaid provider to get transactions
            # We may need to enhance the provider to support transaction fetching
            transactions = await self.plaid_provider.get_transactions(
                user_id,
                start_date=datetime.now() - timedelta(days=730),  # 2 years max
                end_date=datetime.now()
            )
            
            # Convert to dictionaries for processing
            transaction_list = []
            for transaction in transactions:
                trans_dict = {
                    'transaction_id': getattr(transaction, 'transaction_id', str(transaction)),
                    'account_id': transaction.account_id,
                    'security_id': getattr(transaction, 'security_id', ''),
                    'amount': float(getattr(transaction, 'amount', 0)),
                    'quantity': float(getattr(transaction, 'quantity', 0)),
                    'price': float(getattr(transaction, 'price', 0)),
                    'date': getattr(transaction, 'date', datetime.now().date()),
                    'type': getattr(transaction, 'transaction_type', 'unknown'),
                    'subtype': getattr(transaction, 'subtype', 'unknown')
                }
                transaction_list.append(trans_dict)
            
            return transaction_list
            
        except Exception as e:
            logger.error(f"Error getting transaction history for user {user_id}: {e}")
            # For now, return empty list - we can still do reconstruction with just current holdings
            return []
    
    def _extract_unique_securities(self, holdings: List[Dict[str, Any]], 
                                 transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract all unique securities from holdings and transactions.
        """
        unique_securities = {}
        
        # Extract from current holdings
        for holding in holdings:
            security_id = holding.get('security_id')
            if security_id and security_id not in unique_securities:
                unique_securities[security_id] = {
                    'security_id': security_id,
                    'ticker_symbol': holding.get('symbol'),  # Use symbol as ticker
                    'name': holding.get('security_name'),
                    'type': holding.get('security_type'),
                    'cusip': holding.get('cusip'),  # May not be available
                    'source': 'holdings'
                }
        
        # Extract from transactions (may have additional securities)
        for transaction in transactions:
            security_id = transaction.get('security_id')
            if security_id and security_id not in unique_securities:
                unique_securities[security_id] = {
                    'security_id': security_id,
                    'ticker_symbol': None,  # Need to get from security metadata
                    'name': None,
                    'type': 'unknown',
                    'cusip': None,
                    'source': 'transactions'
                }
        
        return list(unique_securities.values())
    
    async def _get_successful_mappings(self, securities: List[Dict[str, Any]]) -> Dict[str, str]:
        """
        Get successful Plaid security_id → FMP symbol mappings from database.
        """
        try:
            supabase = self._get_supabase_client()
            
            security_ids = [s['security_id'] for s in securities]
            
            result = supabase.table('global_security_symbol_mappings')\
                .select('plaid_security_id, fmp_symbol')\
                .in_('plaid_security_id', security_ids)\
                .not_.is_('fmp_symbol', 'null')\
                .execute()
            
            mapping = {}
            if result.data:
                for row in result.data:
                    mapping[row['plaid_security_id']] = row['fmp_symbol']
            
            return mapping
            
        except Exception as e:
            logger.error(f"Error getting successful mappings: {e}")
            return {}
    
    async def _reconstruct_daily_timeline(self, user_id: str,
                                        current_holdings: List[Dict[str, Any]],
                                        transactions: List[Dict[str, Any]],
                                        symbol_mapping: Dict[str, str],
                                        start_date: date,
                                        end_date: date) -> List[PortfolioSnapshot]:
        """
        Core reconstruction algorithm: work backwards from current state.
        
        This is the heart of the reconstruction engine.
        """
        try:
            logger.info(f"🔄 Starting timeline reconstruction for user {user_id}")
            
            # Initialize portfolio state with current holdings
            portfolio_state = self._initialize_portfolio_state(current_holdings, symbol_mapping)
            
            # Group transactions by date for efficient processing
            transactions_by_date = self._group_transactions_by_date(transactions)
            
            # Build timeline working backwards
            portfolio_timeline = []
            current_date = end_date
            
            while current_date >= start_date:
                
                # Apply transactions for this date in reverse chronological order
                if current_date in transactions_by_date:
                    for transaction in reversed(transactions_by_date[current_date]):
                        portfolio_state = await self._reverse_transaction(
                            portfolio_state, transaction, symbol_mapping
                        )
                
                # Calculate portfolio value for this date
                daily_snapshot = await self._calculate_portfolio_value_for_date(
                    user_id, portfolio_state, current_date, symbol_mapping
                )
                
                if daily_snapshot:
                    portfolio_timeline.append(daily_snapshot)
                
                # Move to previous day
                current_date -= timedelta(days=1)
                
                # Progress tracking (every 30 days)
                if len(portfolio_timeline) % 30 == 0:
                    progress = 60.0 + (len(portfolio_timeline) / 730 * 30)  # 60-90% range
                    await self._update_reconstruction_status(user_id, 'in_progress', progress)
            
            # Return in chronological order (oldest first)
            timeline = list(reversed(portfolio_timeline))
            
            logger.info(f"✅ Timeline reconstruction complete: {len(timeline)} daily snapshots")
            
            return timeline
            
        except Exception as e:
            logger.error(f"Error reconstructing timeline for user {user_id}: {e}")
            return []
    
    def _initialize_portfolio_state(self, current_holdings: List[Dict[str, Any]], 
                                  symbol_mapping: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
        """
        Initialize portfolio state from current holdings.
        
        Returns portfolio state structure:
        {
            'security_id': {
                'symbol': 'AAPL',
                'quantity': 100.0,
                'cost_basis': 15000.0,
                'account_id': 'plaid_account_123',
                'institution': 'Charles Schwab'
            }
        }
        """
        portfolio_state = {}
        
        for holding in current_holdings:
            security_id = holding['security_id']
            
            # Only include securities that we can map to FMP symbols
            if security_id in symbol_mapping:
                portfolio_state[security_id] = {
                    'symbol': holding['symbol'],
                    'fmp_symbol': symbol_mapping[security_id],
                    'quantity': holding['quantity'],
                    'cost_basis': holding['cost_basis'],
                    'account_id': holding['account_id'],
                    'institution': holding['institution_name'],
                    'security_type': holding['security_type']
                }
        
        return portfolio_state
    
    def _group_transactions_by_date(self, transactions: List[Dict[str, Any]]) -> Dict[date, List[Dict[str, Any]]]:
        """
        Group transactions by date for efficient processing.
        """
        transactions_by_date = {}
        
        for transaction in transactions:
            trans_date = transaction['date']
            if isinstance(trans_date, str):
                trans_date = datetime.fromisoformat(trans_date).date()
            elif isinstance(trans_date, datetime):
                trans_date = trans_date.date()
            
            if trans_date not in transactions_by_date:
                transactions_by_date[trans_date] = []
            
            transactions_by_date[trans_date].append(transaction)
        
        return transactions_by_date
    
    async def _reverse_transaction(self, portfolio_state: Dict[str, Dict[str, Any]], 
                                 transaction: Dict[str, Any], 
                                 symbol_mapping: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
        """
        Apply a transaction in reverse to reconstruct historical state.
        
        CRITICAL: Plaid uses negative amounts for INFLOWS (sales, dividends) 
        and positive amounts for OUTFLOWS (purchases).
        
        Transaction types and their reversal:
        - Buy (amount > 0): Remove shares and cost basis (reverse the purchase)
        - Sell (amount < 0): Add shares back (reverse the sale)
        - Dividend (amount < 0): No position change, only cash (ignored for reconstruction)
        - Interest (amount < 0): No position change, only cash (ignored for reconstruction)
        - Fee (amount > 0): No position change, only cash (ignored for reconstruction)
        - Transfer: Add/remove shares based on direction
        - Deposit/Withdrawal: Cash only (ignored for reconstruction)
        """
        try:
            security_id = transaction.get('security_id')
            
            # Handle cash-only transactions (no security_id)
            if not security_id:
                # Cash transactions (dividends without security, deposits, withdrawals) 
                # don't affect holdings reconstruction
                return portfolio_state
            
            if security_id not in symbol_mapping:
                # Skip securities we couldn't map to FMP symbols
                logger.debug(f"Skipping unmapped security {security_id}")
                return portfolio_state
            
            transaction_type = transaction.get('subtype', '').lower()
            quantity = float(transaction.get('quantity', 0))
            amount = float(transaction.get('amount', 0))
            price = float(transaction.get('price', 0))
            fees = float(transaction.get('fees', 0)) if transaction.get('fees') else 0.0
            
            # Ensure security exists in portfolio state
            if security_id not in portfolio_state:
                portfolio_state[security_id] = {
                    'symbol': symbol_mapping[security_id],
                    'fmp_symbol': symbol_mapping[security_id],
                    'quantity': 0.0,
                    'cost_basis': 0.0,
                    'account_id': transaction.get('account_id', ''),
                    'institution': 'Unknown',
                    'security_type': 'equity'
                }
            
            current_position = portfolio_state[security_id]
            
            # Apply reverse transaction logic based on Plaid's transaction structure
            # Reference: https://plaid.com/docs/api/products/investments/#investmentstransactionsget
            
            if transaction_type in ['buy', 'purchase']:
                """
                BUY transaction (forward):
                - quantity: positive (shares added)
                - amount: positive (cash outflow/cost)
                - price: price per share
                
                REVERSE operation: Remove shares and cost basis
                """
                current_position['quantity'] -= abs(quantity)
                # Cost basis = amount + fees (total cost of purchase)
                total_cost = abs(amount) + abs(fees)
                current_position['cost_basis'] -= total_cost
                
                logger.debug(f"Reversed BUY: {security_id} - {abs(quantity)} shares, ${total_cost:.2f} cost basis")
                
            elif transaction_type in ['sell', 'sale']:
                """
                SELL transaction (forward):
                - quantity: negative (shares removed)
                - amount: negative (cash inflow/proceeds)
                - price: price per share
                
                REVERSE operation: Add shares back and restore their cost basis
                """
                current_position['quantity'] += abs(quantity)
                
                # For sells, we need to estimate the original cost basis
                # Use the transaction price as a proxy for the original cost
                # This is an approximation since we don't have the original purchase price
                if price > 0:
                    estimated_cost_basis = abs(quantity) * price
                else:
                    # Fallback: use proceeds (amount) as cost basis estimate
                    estimated_cost_basis = abs(amount) - abs(fees)
                
                current_position['cost_basis'] += estimated_cost_basis
                
                logger.debug(f"Reversed SELL: {security_id} + {abs(quantity)} shares, ${estimated_cost_basis:.2f} cost basis")
                
            elif transaction_type in ['dividend', 'cash dividend']:
                """
                DIVIDEND transaction (forward):
                - quantity: 0 (no shares change)
                - amount: negative (cash inflow)
                - security_id: may or may not be present
                
                REVERSE operation: No position change (dividends don't affect holdings)
                """
                # Dividends don't affect share quantity or cost basis
                # They only affect cash, which we're not tracking in reconstruction
                logger.debug(f"Skipped DIVIDEND: {security_id} - no position change")
                pass
                
            elif transaction_type in ['interest']:
                """
                INTEREST transaction: Similar to dividend, no position change
                """
                logger.debug(f"Skipped INTEREST: {security_id} - no position change")
                pass
                
            elif transaction_type in ['fee', 'tax']:
                """
                FEE/TAX transactions: Cash only, no position change
                """
                logger.debug(f"Skipped FEE/TAX: no position change")
                pass
                
            elif transaction_type in ['transfer']:
                """
                TRANSFER transaction: Moving securities between accounts
                - quantity: positive (transfer in) or negative (transfer out)
                
                REVERSE operation: Opposite direction transfer
                """
                # Reverse the transfer direction
                current_position['quantity'] -= quantity
                
                # Transfers typically don't change cost basis (same security, different account)
                # But if there's an amount, it might indicate a cost basis adjustment
                if amount != 0:
                    current_position['cost_basis'] -= abs(amount)
                
                logger.debug(f"Reversed TRANSFER: {security_id} {-quantity} shares")
                
            elif transaction_type in ['split', 'stock split']:
                """
                STOCK SPLIT: Complex transaction requiring split ratio
                For now, we'll handle basic forward splits
                
                Example: 2-for-1 split
                - quantity: additional shares added (for 100 shares, quantity = 100)
                - Original shares: not directly in transaction
                
                REVERSE operation: Reverse the split ratio
                """
                # This is complex and rare - for now, log a warning
                logger.warning(f"Stock split detected for {security_id} - manual review may be needed")
                # We could potentially extract split ratio from quantity changes
                # but this requires additional logic and isn't critical for MVP
                pass
                
            elif transaction_type in ['deposit', 'withdrawal']:
                """
                DEPOSIT/WITHDRAWAL: Cash only transactions
                """
                logger.debug(f"Skipped DEPOSIT/WITHDRAWAL: cash only")
                pass
                
            else:
                """
                Unknown transaction type - log for investigation
                """
                logger.warning(f"Unknown transaction type '{transaction_type}' for {security_id} - skipping")
                pass
            
            # Data quality checks: Ensure quantities and cost basis don't go negative
            if current_position['quantity'] < -0.001:  # Allow small floating point errors
                logger.warning(
                    f"Negative quantity after reverse transaction for {security_id}: "
                    f"{current_position['quantity']:.4f} (transaction: {transaction_type}, "
                    f"quantity: {quantity}, amount: {amount})"
                )
                # Set to zero rather than negative (data quality issue)
                current_position['quantity'] = 0.0
            
            if current_position['cost_basis'] < -0.01:  # Allow small floating point errors
                logger.warning(
                    f"Negative cost basis after reverse transaction for {security_id}: "
                    f"${current_position['cost_basis']:.2f} (transaction: {transaction_type}, "
                    f"amount: {amount})"
                )
                # Set to zero rather than negative (data quality issue)
                current_position['cost_basis'] = 0.0
            
            # Clean up positions with zero quantity (remove from state to reduce memory)
            if abs(current_position['quantity']) < 0.001:
                # Keep the entry but mark quantity as exactly zero
                current_position['quantity'] = 0.0
            
            return portfolio_state
            
        except Exception as e:
            logger.error(f"Error reversing transaction {transaction.get('id', 'unknown')}: {e}", exc_info=True)
            # Return unchanged state on error (graceful degradation)
            return portfolio_state
    
    async def _calculate_portfolio_value_for_date(self, user_id: str,
                                                portfolio_state: Dict[str, Dict[str, Any]], 
                                                target_date: date,
                                                symbol_mapping: Dict[str, str]) -> Optional[PortfolioSnapshot]:
        """
        Calculate total portfolio value for a specific date using historical prices.
        """
        try:
            total_value = 0.0
            total_cost_basis = 0.0
            securities_count = 0
            account_breakdown = {}
            institution_breakdown = {}
            
            # Calculate value for each position
            for security_id, position in portfolio_state.items():
                if position['quantity'] <= 0:
                    continue  # Skip positions with no shares
                
                fmp_symbol = position['fmp_symbol']
                quantity = position['quantity']
                cost_basis = position['cost_basis']
                
                # Get historical price for this date
                historical_price = await self.historical_price_service.get_price_for_symbol_on_date(
                    fmp_symbol, target_date
                )
                
                if historical_price and historical_price > 0:
                    position_value = quantity * historical_price
                    total_value += position_value
                    total_cost_basis += cost_basis
                    securities_count += 1
                    
                    # Track by account for future filtering
                    account_id = position['account_id']
                    institution = position['institution']
                    
                    account_breakdown[account_id] = account_breakdown.get(account_id, 0) + position_value
                    institution_breakdown[institution] = institution_breakdown.get(institution, 0) + position_value
            
            # Calculate performance metrics
            total_gain_loss = total_value - total_cost_basis
            total_gain_loss_percent = (total_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0.0
            
            # Cap percentage for database compatibility
            if total_gain_loss_percent > 999.99:
                total_gain_loss_percent = 999.99
            elif total_gain_loss_percent < -999.99:
                total_gain_loss_percent = -999.99
            
            # Calculate data quality score
            data_quality = (securities_count / len(portfolio_state) * 100) if portfolio_state else 100.0
            
            return PortfolioSnapshot(
                date=target_date,
                total_value=total_value,
                total_cost_basis=total_cost_basis,
                total_gain_loss=total_gain_loss,
                total_gain_loss_percent=total_gain_loss_percent,
                securities_count=securities_count,
                account_breakdown=account_breakdown,
                institution_breakdown=institution_breakdown,
                data_quality_score=data_quality
            )
            
        except Exception as e:
            logger.error(f"Error calculating portfolio value for {target_date}: {e}")
            return None
    
    async def _store_reconstructed_timeline(self, user_id: str, timeline: List[PortfolioSnapshot]):
        """
        Store complete reconstructed timeline permanently in database.
        """
        try:
            supabase = self._get_supabase_client()
            
            # Prepare batch insert data
            timeline_records = []
            for snapshot in timeline:
                record = {
                    'user_id': user_id,
                    'value_date': snapshot.date.isoformat(),
                    'snapshot_type': 'reconstructed',
                    'total_value': snapshot.total_value,
                    'total_cost_basis': snapshot.total_cost_basis,
                    'total_gain_loss': snapshot.total_gain_loss,
                    'total_gain_loss_percent': snapshot.total_gain_loss_percent,
                    'account_breakdown': json.dumps(snapshot.account_breakdown),
                    'institution_breakdown': json.dumps(snapshot.institution_breakdown),
                    'data_source': 'reconstructed',
                    'price_source': 'fmp',
                    'data_quality_score': snapshot.data_quality_score,
                    'securities_count': snapshot.securities_count
                }
                timeline_records.append(record)
            
            # Batch insert (this could be thousands of records)
            # For large datasets, we may want to batch this further
            batch_size = 1000
            for i in range(0, len(timeline_records), batch_size):
                batch = timeline_records[i:i + batch_size]
                
                supabase.table('user_portfolio_history')\
                    .upsert(batch, on_conflict='user_id,value_date,snapshot_type')\
                    .execute()
                
                logger.debug(f"💾 Stored batch {i//batch_size + 1}: {len(batch)} records")
            
            logger.info(f"✅ Stored complete timeline: {len(timeline_records)} daily snapshots")
            
        except Exception as e:
            logger.error(f"Error storing reconstructed timeline: {e}")
    
    async def _update_reconstruction_status(self, user_id: str, status: str, 
                                          progress: float, error: Optional[str] = None):
        """
        Update reconstruction status for user experience tracking.
        """
        try:
            supabase = self._get_supabase_client()
            
            status_update = {
                'user_id': user_id,
                'reconstruction_status': status,
                'reconstruction_progress': progress,
                'updated_at': datetime.now().isoformat()
            }
            
            if status == 'in_progress' and progress == 0.0:
                status_update['started_at'] = datetime.now().isoformat()
            elif status == 'completed':
                status_update['completed_at'] = datetime.now().isoformat()
            elif status == 'failed' and error:
                status_update['error_message'] = error
            
            supabase.table('user_portfolio_reconstruction_status')\
                .upsert(status_update, on_conflict='user_id')\
                .execute()
                
        except Exception as e:
            logger.error(f"Error updating reconstruction status: {e}")

# Global service instance
portfolio_history_reconstructor = PortfolioHistoryReconstructor()

def get_portfolio_history_reconstructor() -> PortfolioHistoryReconstructor:
    """Get the global portfolio history reconstructor instance."""
    return portfolio_history_reconstructor
