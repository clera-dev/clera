"""
Purchase history and account activities tools for retrieving transaction data.
"""

import os
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from alpaca.broker import BrokerClient
from langgraph.config import get_config
from langchain_core.runnables.config import RunnableConfig

# Import shared account utilities  
from utils.account_utils import get_account_id

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Alpaca broker client
broker_client = BrokerClient(
    api_key=os.getenv("BROKER_API_KEY"),
    secret_key=os.getenv("BROKER_SECRET_KEY"),
    sandbox=os.getenv("ALPACA_SANDBOX", "true").lower() == "true"
)




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
    def from_alpaca_activity(cls, activity: Any) -> 'ActivityRecord':
        """Create an ActivityRecord from an Alpaca activity object."""
        # Handle datetime parsing
        transaction_time = activity.transaction_time
        if isinstance(transaction_time, str):
            try:
                # Parse ISO format datetime
                transaction_time = datetime.fromisoformat(transaction_time.replace('Z', '+00:00'))
            except ValueError:
                # Fallback to current time if parsing fails
                transaction_time = datetime.now(timezone.utc)
        
        # Extract relevant fields
        symbol = getattr(activity, 'symbol', None)
        quantity = None
        price = None
        side = None
        net_amount = None
        
        # Handle different activity types
        activity_type = getattr(activity, 'activity_type', 'unknown')
        
        if hasattr(activity, 'qty') and activity.qty is not None:
            try:
                quantity = Decimal(str(activity.qty))
            except (InvalidOperation, ValueError):
                quantity = None
                
        if hasattr(activity, 'price') and activity.price is not None:
            try:
                price = Decimal(str(activity.price))
            except (InvalidOperation, ValueError):
                price = None
                
        if hasattr(activity, 'side'):
            side = str(activity.side) if activity.side else None
            
        if hasattr(activity, 'net_amount') and activity.net_amount is not None:
            try:
                net_amount = Decimal(str(activity.net_amount))
            except (InvalidOperation, ValueError):
                net_amount = None
        
        # Generate description
        description = cls._generate_description(activity_type, symbol, quantity, price, side, net_amount)
        
        return cls(
            activity_type=activity_type,
            symbol=symbol,
            transaction_time=transaction_time,
            quantity=quantity,
            price=price,
            side=side,
            net_amount=net_amount,
            description=description,
            id=getattr(activity, 'id', str(hash(str(activity))))
        )
    
    @staticmethod
    def _generate_description(activity_type: str, symbol: Optional[str], quantity: Optional[Decimal], 
                            price: Optional[Decimal], side: Optional[str], net_amount: Optional[Decimal]) -> str:
        """Generate a human-readable description of the activity."""
        if activity_type == 'FILL' and symbol and quantity and side:
            action = "Bought" if side.lower() == 'buy' else "Sold"
            if price:
                return f"{action} {quantity} shares of {symbol} at ${price}"
            else:
                return f"{action} {quantity} shares of {symbol}"
        elif activity_type == 'DIV' and symbol and net_amount:
            return f"Dividend payment of ${net_amount} from {symbol}"
        elif activity_type == 'ACATC':
            return "Account transfer (ACAT)"
        elif activity_type == 'CSD':
            return "Cash dividend"
        elif activity_type == 'CSR':
            return "Cash receipt"
        elif activity_type == 'CSW':
            return "Cash withdrawal"
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
        
        request = GetAccountActivitiesRequest(
            activity_types=activity_types,
            page_size=page_size,
            **date_params
        )
        
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
    account_id = get_account_id(config=config)
    
    # Get longer history to find first purchases (365 days) - only returns 1 date per symbol
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=365)
    
    # Get all trade activities
    trade_activities = get_account_activities(
        account_id=account_id,
        activity_types=['FILL'],
        date_start=start_date,
        date_end=end_date,
        page_size=100  # Max page size is 100
    )
    
    # Find first purchase for each symbol
    first_purchases = {}
    for activity in trade_activities:
        if activity.symbol and activity.side:
            # Check if it's a buy transaction (handle both string and enum formats)
            side_str = str(activity.side).lower()
            if 'buy' in side_str:
                if activity.symbol not in first_purchases:
                    first_purchases[activity.symbol] = activity.transaction_time
                else:
                    # Keep the earliest date
                    if activity.transaction_time < first_purchases[activity.symbol]:
                        first_purchases[activity.symbol] = activity.transaction_time
    
    return first_purchases


def get_comprehensive_account_activities(account_id: str = None, days_back: int = 60, config: RunnableConfig = None) -> str:
    """
    Get comprehensive account activities including trading history, dividends, and other activities.
    
    This combines all account activities into one comprehensive view with:
    - Trading history (purchases/sales) 
    - Account activities summary
    - Recent transaction details
    - Trading statistics
    
    Args:
        account_id: Alpaca account ID (optional, will be retrieved if not provided)
        days_back: Number of days to look back (default: 60)
        config: LangGraph configuration object
        
    Returns:
        str: Formatted comprehensive account activities report
    """
    try:
        logger.info(f"[Account Activities] Getting comprehensive activities for last {days_back} days")
        
        # Get account ID if not provided
        if not account_id:
            account_id = get_account_id(config=config)
        
        if not account_id:
            return "❌ **Error**: Could not retrieve account information. Please check your account setup."
        
        # Calculate date range
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days_back)
        
        # Get trading activities (FILL)
        trading_activities = get_account_activities(
            account_id=account_id,
            activity_types=['FILL'],
            date_start=start_date,
            date_end=end_date
        )
        
        # Get all other activities (dividends, fees, etc.)
        other_activities = get_account_activities(
            account_id=account_id,
            activity_types=['DIV', 'ACATC', 'CSD', 'CSW', 'FEE', 'INT'],
            date_start=start_date,
            date_end=end_date
        )
        
        # Combine and sort all activities
        all_activities = trading_activities + other_activities
        all_activities.sort(key=lambda x: x.transaction_time, reverse=True)
        
        if not all_activities:
            return f"""📋 **Account Activities**

❌ **No Recent Activities Found**

No account activities found in the last {days_back} days. This could mean:
• Your account is new
• No transactions have occurred recently
• Activities are still processing

💡 **Next Steps:**
• Check for pending transactions
• Review your account status
• Try extending the date range"""
        
        # Separate trading activities for detailed purchase history
        trades = [a for a in all_activities if a.activity_type == 'FILL']
        non_trades = [a for a in all_activities if a.activity_type != 'FILL']
        
        # Build comprehensive report
        report = f"📋 **Account Activities** ({days_back}-day summary)\n\n"
        
        # Activity Summary
        report += "📊 **Activity Summary**\n"
        report += f"• **Total Activities:** {len(all_activities)}\n"
        report += f"• **Trades:** {len(trades)}\n"
        report += f"• **Other Activities:** {len(non_trades)}\n"
        
        # Trading statistics
        if trades:
            symbols = set()
            buy_count = 0
            sell_count = 0
            total_volume = Decimal('0')
            
            for trade in trades:
                if trade.symbol:
                    symbols.add(trade.symbol)
                side_str = str(trade.side).lower() if trade.side else ""
                if 'buy' in side_str:
                    buy_count += 1
                elif 'sell' in side_str:
                    sell_count += 1
                
                # Calculate trade volume: use net_amount if available, otherwise calculate qty * price
                if trade.net_amount:
                    total_volume += abs(Decimal(str(trade.net_amount)))
                elif trade.quantity and trade.price:
                    calculated_amount = abs(Decimal(str(trade.quantity)) * Decimal(str(trade.price)))
                    total_volume += calculated_amount
            
            report += f"• **Unique Symbols Traded:** {len(symbols)}\n"
            report += f"• **Buy Transactions:** {buy_count}\n"
            report += f"• **Sell Transactions:** {sell_count}\n"
            report += f"• **Total Volume:** ${total_volume:,.2f}\n\n"
        
        # Purchase History Section (detailed trading history)
        if trades:
            report += "💰 **Purchase History** (Trading Details)\n\n"
            
            # Group trades by date
            trades_by_date = {}
            for trade in trades[:50]:  # Limit to last 50 trades
                date_str = trade.transaction_time.strftime('%A, %B %d, %Y')
                if date_str not in trades_by_date:
                    trades_by_date[date_str] = []
                trades_by_date[date_str].append(trade)
            
            # Format each date group
            for date_str, date_trades in trades_by_date.items():
                report += f"📆 **{date_str}**\n"
                
                for trade in date_trades:
                    time_str = trade.transaction_time.strftime('%I:%M %p')
                    
                    # Determine emoji and action
                    side_str = str(trade.side).lower() if trade.side else ""
                    if 'buy' in side_str:
                        emoji = "🟢"
                        action = "Bought"
                    elif 'sell' in side_str:
                        emoji = "🔴"
                        action = "Sold"
                    else:
                        emoji = "📊"
                        action = "Traded"
                    
                    # Format quantity and price
                    qty_str = f"{float(trade.quantity):.6f}".rstrip('0').rstrip('.') if trade.quantity else "0"
                    price_str = f"${float(trade.price):.2f}" if trade.price else "$0.00"
                    
                    # Calculate total: use net_amount if available, otherwise calculate qty * price
                    if trade.net_amount:
                        total_str = f"${abs(float(trade.net_amount)):.2f}"
                    elif trade.quantity and trade.price:
                        calculated_total = float(trade.quantity) * float(trade.price)
                        total_str = f"${calculated_total:.2f}"
                    else:
                        total_str = "$0.00"
                    
                    report += f"  {emoji} **{time_str}** - {action} {qty_str} shares of {trade.symbol} at {price_str}\n"
                    report += f"    💰 Total: {total_str}\n"
                
                report += "\n"
        
        # Recent Activities Section (non-trading activities)
        if non_trades:
            report += "📈 **Other Account Activities**\n\n"
            
            # Group by activity type
            activity_groups = {}
            for activity in non_trades[:20]:  # Limit to last 20
                act_type = str(activity.activity_type)
                if act_type not in activity_groups:
                    activity_groups[act_type] = []
                activity_groups[act_type].append(activity)
            
            for act_type, activities in activity_groups.items():
                type_emoji = "💸" if act_type == "DIV" else "📋"
                type_name = "Dividends" if act_type == "DIV" else f"{act_type} Activities"
                
                report += f"{type_emoji} **{type_name}** ({len(activities)} activities)\n"
                
                for activity in activities:
                    date_str = activity.transaction_time.strftime('%b %d, %Y')
                    amount_str = f"${abs(float(activity.net_amount)):.2f}" if activity.net_amount else ""
                    
                    if activity.symbol:
                        report += f"• {date_str} - {activity.symbol} {amount_str}\n"
                    else:
                        report += f"• {date_str} - {activity.description or act_type} {amount_str}\n"
                
                report += "\n"
        
        # First Purchase Dates Section (365-day lookback)
        try:
            first_purchase_dates = find_first_purchase_dates(config=config)
            if first_purchase_dates:
                report += "📅 **First Purchase Dates** (365-day lookback)\n\n"
                
                # Sort by date (most recent first)
                sorted_purchases = sorted(first_purchase_dates.items(), key=lambda x: x[1], reverse=True)
                
                for symbol, purchase_date in sorted_purchases:
                    date_str = purchase_date.strftime('%B %d, %Y')
                    days_ago = (datetime.now(timezone.utc) - purchase_date).days
                    
                    if days_ago == 0:
                        time_str = "today"
                    elif days_ago == 1:
                        time_str = "1 day ago"
                    else:
                        time_str = f"{days_ago} days ago"
                    
                    report += f"• **{symbol}**: First purchased on {date_str} ({time_str})\n"
                
                report += "\n"
        except Exception as e:
            logger.warning(f"[Account Activities] Could not retrieve first purchase dates: {str(e)}")
        
        # Footer with helpful suggestions
        report += "💡 **Need More Details?**\n"
        report += "• Ask about specific stock purchase dates\n"
        report += "• Request longer date ranges for more history\n"
        report += "• Check portfolio performance since purchase\n"
        report += "\n📝 **Important Notes:**\n"
        report += "• Trading activities shown are FILLED orders only (no pending orders)\n"
        report += "• Recent activities cover the last 60 days\n"
        report += "• First purchase dates cover the last 365 days\n"
        
        return report
        
    except Exception as e:
        logger.error(f"[Account Activities] Error getting comprehensive activities: {str(e)}")
        return f"""📋 **Account Activities**

❌ **Error Retrieving Activities**

Could not retrieve account activities: {str(e)}

💡 **Troubleshooting:**
• Check your internet connection
• Verify account permissions
• Try again in a few moments""" 