"""
Purchase history and account activity tools for portfolio management.
"""

import os
import logging
from typing import List, Optional, Dict
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from decimal import Decimal
from langchain_core.runnables.config import RunnableConfig

from utils.account_utils import get_account_id
from utils.alpaca.broker_client_factory import get_broker_client
from decimal import InvalidOperation

# Configure logging
logger = logging.getLogger(__name__)

# Use centralized broker client
broker_client = get_broker_client()


@dataclass
class ActivityRecord:
    """Represents a single account activity record."""
    activity_type: str
    symbol: Optional[str]
    transaction_time: datetime
    quantity: Optional[Decimal]
    price: Optional[Decimal]
    side: Optional[str]  # 'buy' or 'sell'
    net_amount: Optional[Decimal]
    description: str
    id: str

    @classmethod
    def from_alpaca_activity(cls, activity) -> 'ActivityRecord':
        """Create an ActivityRecord from an Alpaca activity object."""
        try:
            # Extract basic fields
            activity_type = getattr(activity, 'activity_type', 'UNKNOWN')
            symbol = getattr(activity, 'symbol', None)
            activity_id = getattr(activity, 'id', str(datetime.now().timestamp()))
            
            # Parse transaction time
            transaction_time = getattr(activity, 'transaction_time', None)
            if transaction_time is None:
                transaction_time = getattr(activity, 'date', datetime.now(timezone.utc))
            if isinstance(transaction_time, str):
                transaction_time = datetime.fromisoformat(transaction_time.replace('Z', '+00:00'))
            elif not isinstance(transaction_time, datetime):
                transaction_time = datetime.now(timezone.utc)
            
            # Ensure timezone awareness
            if transaction_time.tzinfo is None:
                transaction_time = transaction_time.replace(tzinfo=timezone.utc)
            
            # Extract trade-specific fields (for FILL activities)
            quantity = None
            price = None
            side = None
            net_amount = None
            
            if hasattr(activity, 'qty'):
                try:
                    quantity = Decimal(str(activity.qty))
                except (ValueError, InvalidOperation):
                    quantity = None
            
            if hasattr(activity, 'price'):
                try:
                    price = Decimal(str(activity.price))
                except (ValueError, InvalidOperation):
                    price = None
            
            if hasattr(activity, 'side'):
                # 🔧 IMPROVED: Normalize side values for consistent processing
                raw_side = str(activity.side)
                # Handle enum formats like "OrderSide.BUY" -> "buy"
                if '.' in raw_side:
                    side = raw_side.split('.')[-1].lower()  # Extract "BUY" -> "buy"
                else:
                    side = raw_side.lower()  # Direct "BUY" -> "buy"
                
                # Normalize some alternative formats
                if side == 'long':
                    side = 'buy'
                elif side == 'short':
                    side = 'sell'
            
            if hasattr(activity, 'net_amount'):
                try:
                    net_amount = Decimal(str(activity.net_amount))
                except (ValueError, InvalidOperation):
                    net_amount = None
            
            # Create description
            description = cls._create_description(activity_type, symbol, side, quantity, price, net_amount)
            
            return cls(
                activity_type=activity_type,
                symbol=symbol,
                transaction_time=transaction_time,
                quantity=quantity,
                price=price,
                side=side,
                net_amount=net_amount,
                description=description,
                id=activity_id
            )
            
        except Exception as e:
            logger.error(f"[Purchase History] Failed to parse activity: {e}")
            raise ValueError(f"Could not parse activity: {e}")
    
    @staticmethod
    def _create_description(activity_type: str, symbol: Optional[str], side: Optional[str], 
                          quantity: Optional[Decimal], price: Optional[Decimal], 
                          net_amount: Optional[Decimal]) -> str:
        """Create a human-readable description of the activity."""
        if activity_type == 'FILL' and symbol and side:
            action = side.title()
            if quantity and price:
                return f"{action} {quantity} shares of {symbol} at ${price:.2f}"
            elif net_amount:
                return f"{action} {symbol} for ${abs(net_amount):.2f}"
            else:
                return f"{action} {symbol}"
        else:
            return f"{activity_type} activity" + (f" for {symbol}" if symbol else "")


def get_account_activities(
    account_id: str,
    activity_types: Optional[List[str]] = None,
    date_start: Optional[datetime] = None,
    date_end: Optional[datetime] = None,
    page_size: int = 100
) -> List[ActivityRecord]:
    """
    Retrieve account activities using the Alpaca Broker API.
    
    Args:
        account_id: The Alpaca account ID
        activity_types: List of activity types to filter by (e.g., ['FILL', 'DIV'])
        date_start: Start date for activities (defaults to 30 days ago)
        date_end: End date for activities (defaults to now)
        page_size: Number of activities per page (max 100)
    
    Returns:
        List[ActivityRecord]: List of account activities
    """
    try:
        # Set default date range if not provided
        if date_end is None:
            date_end = datetime.now(timezone.utc)
        if date_start is None:
            date_start = date_end - timedelta(days=30)
        
        # Convert datetime objects to ISO string format if needed
        # Use 'after' and 'until' for date ranges, not 'date'
        date_params = {}
        if date_start:
            date_params['after'] = date_start.strftime('%Y-%m-%d')
        if date_end:
            date_params['until'] = date_end.strftime('%Y-%m-%d')
        
        # Get activities from Alpaca using GetAccountActivitiesRequest
        from alpaca.broker.requests import GetAccountActivitiesRequest
        
        # 🚨 CRITICAL FIX: Add account_id parameter to prevent data leakage
        request = GetAccountActivitiesRequest(
            account_id=account_id,  # ✅ This ensures we only get activities for THIS user
            activity_types=activity_types,
            page_size=page_size,
            **date_params
        )
        
        # Call the Alpaca API with the properly filtered request
        activities = broker_client.get_account_activities(request)
        
        # Convert to our ActivityRecord objects
        activity_records = []
        for activity in activities:
            try:
                record = ActivityRecord.from_alpaca_activity(activity)
                activity_records.append(record)
            except Exception as e:
                logger.warning(f"[Purchase History] Failed to parse activity {getattr(activity, 'id', 'unknown')}: {e}")
                continue
        
        # Sort by transaction time (most recent first)
        activity_records.sort(key=lambda x: x.transaction_time, reverse=True)
        
        logger.info(f"[Purchase History] Retrieved {len(activity_records)} activities for account {account_id}")
        return activity_records
        
    except Exception as e:
        logger.error(f"[Purchase History] Failed to retrieve activities for account {account_id}: {e}", exc_info=True)
        return []


def find_first_purchase_dates(config: RunnableConfig = None) -> Dict[str, datetime]:
    """
    Find the first purchase date for each symbol in the user's portfolio.
    
    Args:
        config: LangGraph configuration
    
    Returns:
        Dict[str, datetime]: Mapping of symbol to first purchase date
    """
    try:
        account_id = get_account_id(config=config)
        
        # Get longer history to find first purchases (365 days) - only returns 1 date per symbol
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=365)
        
        # Get all trade activities with proper account filtering
        trade_activities = get_account_activities(
            account_id=account_id,  # ✅ Properly filter by account
            activity_types=['FILL'],
            date_start=start_date,
            date_end=end_date,
            page_size=100  # Max page size is 100
        )
        
        # Find first purchase for each symbol
        first_purchases = {}
        for activity in trade_activities:
            if activity.symbol and activity.side:
                # 🔧 IMPROVED: Handle all possible side formats from Alpaca API
                side_str = str(activity.side).upper()  # Convert to uppercase for consistency
                
                # Handle multiple possible formats:
                # - "BUY" / "SELL" (direct strings)
                # - "OrderSide.BUY" / "OrderSide.SELL" (enum string representation)  
                # - "buy" / "sell" (lowercase)
                is_buy_transaction = (
                    side_str == 'BUY' or 
                    'BUY' in side_str or
                    side_str == 'LONG'  # Some APIs use LONG for buy positions
                )
                
                if is_buy_transaction:
                    if activity.symbol not in first_purchases:
                        first_purchases[activity.symbol] = activity.transaction_time
                    else:
                        # Keep the earliest date
                        if activity.transaction_time < first_purchases[activity.symbol]:
                            first_purchases[activity.symbol] = activity.transaction_time
        
        logger.info(f"[Purchase History] Found first purchase dates for {len(first_purchases)} symbols")
        return first_purchases
        
    except ValueError as e:
        logger.error(f"[Purchase History] Account identification failed: {e}")
        return {}
    except Exception as e:
        logger.error(f"[Purchase History] Failed to find first purchase dates: {e}", exc_info=True)
        return {}


def fetch_account_activities_data(account_id: str, days_back: int = 60) -> dict:
    """
    Retrieve all activities, trade activities, other activities, and first purchase dates for the account.
    Returns a dictionary with all relevant data for report generation.
    """
    days_back = min(days_back, 60)
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    all_activities = get_account_activities(
        account_id=account_id,
        activity_types=None,
        date_start=start_date,
        date_end=end_date,
        page_size=100
    )
    trade_activities = [a for a in all_activities if a.activity_type == 'FILL']
    other_activities = [a for a in all_activities if a.activity_type != 'FILL']
    first_purchases = find_first_purchase_dates(config=None)
    return {
        'all_activities': all_activities,
        'trade_activities': trade_activities,
        'other_activities': other_activities,
        'first_purchases': first_purchases,
        'days_back': days_back
    }

def calculate_account_activity_stats(trade_activities: list) -> dict:
    """
    Calculate trading statistics from trade activities.
    """
    buy_trades = [a for a in trade_activities if a.side and 'buy' in a.side.lower()]
    sell_trades = [a for a in trade_activities if a.side and 'sell' in a.side.lower()]
    unique_symbols = set(a.symbol for a in trade_activities if a.symbol)
    total_volume = sum(abs(a.net_amount) for a in trade_activities if a.net_amount is not None)
    return {
        'buy_trades': buy_trades,
        'sell_trades': sell_trades,
        'unique_symbols': unique_symbols,
        'total_volume': total_volume
    }

def format_account_activities_report(
    all_activities: list,
    trade_activities: list,
    other_activities: list,
    first_purchases: dict,
    stats: dict,
    days_back: int
) -> str:
    """
    Format the comprehensive account activities report as a markdown string.
    """
    current_timestamp = datetime.now(timezone.utc).strftime('%A, %B %d, %Y at %I:%M %p UTC')
    if not all_activities:
        return f"""📈 **Account Activities Report**
**Period:** Last {days_back} days

❌ **No Activities Found**

No account activities were found for the requested period. This could be because:
• No trades or transactions occurred during this time
• Activities are still processing
• There may be a temporary issue accessing activity data

💡 **Next Steps:**
• Check if you've made any trades recently
• Try requesting a shorter time period
• Contact support if you believe this is an error"""
    report = f"""📈 **Account Activities Report**
**Generated:** {current_timestamp}
**Period:** Last {days_back} days (maximum available)

🔢 **Trading Summary**
• **Total Trades:** {len(trade_activities)}
• **Buy Orders:** {len(stats['buy_trades'])}
• **Sell Orders:** {len(stats['sell_trades'])}
• **Unique Symbols Traded:** {len(stats['unique_symbols'])}
• **Total Trading Volume:** ${stats['total_volume']:,.2f}

📊 **Recent Trading Activity**"""
    if trade_activities:
        recent_trades = trade_activities[:10]
        for activity in recent_trades:
            date_str = activity.transaction_time.strftime('%b %d, %Y')
            side_emoji = "🟢" if activity.side and 'buy' in activity.side.lower() else "🔴"
            if activity.quantity and activity.price:
                report += f"""
{side_emoji} **{activity.symbol}** - {activity.side.title() if activity.side else 'Trade'}
• Date: {date_str}
• Quantity: {activity.quantity} shares
• Price: ${activity.price:.2f}
• Value: ${abs(activity.net_amount or 0):,.2f}"""
            else:
                report += f"""
{side_emoji} **{activity.symbol}** - {activity.description}
• Date: {date_str}"""
    if first_purchases:
        report += f"""

📅 **First Purchase Dates**"""
        for symbol, first_date in sorted(first_purchases.items()):
            date_str = first_date.strftime('%b %d, %Y')
            days_held = (datetime.now(timezone.utc) - first_date).days
            if days_held < 30:
                holding_str = f"{days_held} days"
            elif days_held < 365:
                months = days_held // 30
                holding_str = f"{months} month{'s' if months != 1 else ''}"
            else:
                years = days_held // 365
                holding_str = f"{years} year{'s' if years != 1 else ''}"
            report += f"""
• **{symbol}**: {date_str} ({holding_str} ago)"""
    if other_activities:
        report += f"""

💰 **Other Account Activities**"""
        for activity in other_activities[:5]:
            date_str = activity.transaction_time.strftime('%b %d, %Y')
            report += f"""
• **{activity.activity_type}**: {activity.description}
  Date: {date_str}"""
    report += f"""

ℹ️ **Data Limitations**
This report shows activities from the last {days_back} days only. For older transaction history, please check your account statements or contact support."""
    return report


def get_comprehensive_account_activities(days_back: int = 60, config: RunnableConfig = None) -> str:
    """
    Get a comprehensive formatted report of account activities including trading history,
    statistics, and first purchase dates.
    """
    try:
        account_id = get_account_id(config=config)
        logger.info("[Portfolio Agent] Generating comprehensive account activities")
        data = fetch_account_activities_data(account_id, days_back)
        stats = calculate_account_activity_stats(data['trade_activities'])
        report = format_account_activities_report(
            all_activities=data['all_activities'],
            trade_activities=data['trade_activities'],
            other_activities=data['other_activities'],
            first_purchases=data['first_purchases'],
            stats=stats,
            days_back=data['days_back']
        )
        logger.info(f"[Portfolio Agent] Successfully generated comprehensive activities report with {len(data['all_activities'])} total activities")
        return report
    except ValueError as e:
        logger.error(f"[Portfolio Agent] Account identification error: {e}")
        return f"""📈 **Account Activities Report**

🚫 **Authentication Error**

Could not securely identify your account for this activities report. This is a security protection to prevent unauthorized access.

**Error Details:** {str(e)}

💡 **Next Steps:**
• Please log out and log back in
• Ensure you have completed account setup
• Contact support if the issue persists

**Security Note:** This error prevents unauthorized access to trading data."""
    except Exception as e:
        logger.error(f"[Portfolio Agent] Error generating activities report: {e}", exc_info=True)
        return f"❌ **Error:** Could not generate account activities report. Please try again later.\n\nError details: {str(e)}" 