"""
Supabase utility module for interacting with the Supabase database.
"""

from .db_client import (
    get_supabase_client,
    get_user_alpaca_account_id,
    get_user_id_from_email,
    get_alpaca_account_id_by_email,
    get_user_data,
    save_conversation,
    get_user_conversations,
    get_portfolio_conversations
)

__all__ = [
    'get_supabase_client',
    'get_user_alpaca_account_id',
    'get_user_id_from_email',
    'get_alpaca_account_id_by_email',
    'get_user_data',
    'save_conversation',
    'get_user_conversations',
    'get_portfolio_conversations'
] 