"""
Production-grade feature flag system for Clera portfolio aggregation.

This module implements environment-based feature flags following SOLID principles
to enable clean toggle between brokerage mode (Alpaca) and aggregation mode (Plaid).
"""

import os
import logging
from typing import Dict, Any, Optional
from enum import Enum

logger = logging.getLogger(__name__)

class FeatureFlagKey(Enum):
    """Feature flag keys following naming convention from technical specifications."""
    BROKERAGE_MODE = "brokerage_mode"
    AGGREGATION_MODE = "aggregation_mode"
    # REMOVED: TRADE_EXECUTION - Trade execution is account-based, not mode-based
    MULTI_ACCOUNT_ANALYTICS = "multi_account_analytics"
    PLAID_INVESTMENT_SYNC = "plaid_investment_sync"
    SNAPTRADE_INVESTMENT_SYNC = "snaptrade_investment_sync"
    # REMOVED: SNAPTRADE_TRADE_EXECUTION - Trade execution is always available based on connected accounts, not feature flags
    PORTFOLIO_INSIGHTS = "portfolio_insights"

class FeatureFlags:
    """
    Feature flag management system.
    
    Supports environment-based configuration with future extensibility
    for user-specific overrides and dynamic flag management.
    """
    
    def __init__(self):
        """Initialize feature flags from environment variables."""
        self.flags = self._load_flags()
        logger.info(f"🚩 Feature flags initialized: {self.flags}")
    
    def _load_flags(self) -> Dict[str, bool]:
        """Load feature flags from environment variables or defaults."""
        return {
            FeatureFlagKey.BROKERAGE_MODE.value: self._parse_bool_env(
                'FF_BROKERAGE_MODE', 
                default='false'  # Default to aggregation mode for pivot
            ),
            FeatureFlagKey.AGGREGATION_MODE.value: self._parse_bool_env(
                'FF_AGGREGATION_MODE', 
                default='true'   # Default to aggregation mode for pivot
            ),
            # REMOVED: FF_TRADE_EXECUTION - Trade execution is account-based, not mode-based
            FeatureFlagKey.MULTI_ACCOUNT_ANALYTICS.value: self._parse_bool_env(
                'FF_MULTI_ACCOUNT_ANALYTICS', 
                default='true'   # Enable analytics for aggregated data
            ),
            FeatureFlagKey.PLAID_INVESTMENT_SYNC.value: self._parse_bool_env(
                'FF_PLAID_INVESTMENT_SYNC', 
                default='true'   # Enable Plaid data synchronization
            ),
            FeatureFlagKey.SNAPTRADE_INVESTMENT_SYNC.value: self._parse_bool_env(
                'FF_SNAPTRADE_INVESTMENT_SYNC',
                default='true'   # Enable SnapTrade data synchronization
            ),
            # REMOVED: FF_SNAPTRADE_TRADE_EXECUTION - Trade execution is account-based, not flag-based
            FeatureFlagKey.PORTFOLIO_INSIGHTS.value: self._parse_bool_env(
                'FF_PORTFOLIO_INSIGHTS', 
                default='true'   # Enable portfolio insights features
            )
        }
    
    def _parse_bool_env(self, env_var: str, default: str) -> bool:
        """Parse boolean environment variable with defaults."""
        value = os.getenv(env_var, default).lower().strip()
        return value in ('true', '1', 'yes', 'on', 'enabled')
    
    def is_enabled(self, flag_key: str, user_id: Optional[str] = None) -> bool:
        """
        Check if a feature flag is enabled for a user.
        
        Args:
            flag_key: Feature flag key (string)
            user_id: Optional user identifier for user-specific overrides
            
        Returns:
            True if flag is enabled, False otherwise
        """
        if flag_key not in self.flags:
            logger.warning(f"🚩 Unknown feature flag requested: {flag_key}")
            return False
        
        # Global flag check
        global_enabled = self.flags[flag_key]
        if not global_enabled:
            return False
        
        # TODO: Add user-specific flag overrides if needed in the future
        # This allows for gradual rollouts or user-specific beta testing
        # if user_id:
        #     user_override = self._get_user_flag_override(user_id, flag_key)
        #     if user_override is not None:
        #         return user_override
        
        return True
    
    def is_enabled_enum(self, flag_key: FeatureFlagKey, user_id: Optional[str] = None) -> bool:
        """
        Type-safe feature flag check using enum.
        
        Args:
            flag_key: Feature flag key (enum)
            user_id: Optional user identifier
            
        Returns:
            True if flag is enabled, False otherwise
        """
        return self.is_enabled(flag_key.value, user_id)
    
    def get_all_flags(self, user_id: Optional[str] = None) -> Dict[str, bool]:
        """
        Get all feature flags for a user.
        
        Args:
            user_id: Optional user identifier
            
        Returns:
            Dictionary mapping flag keys to their enabled status
        """
        return {key: self.is_enabled(key, user_id) for key in self.flags.keys()}
    
    def get_portfolio_mode(self, user_id: Optional[str] = None) -> str:
        """
        Get the current portfolio mode for a user.
        
        Returns:
            - "brokerage": Alpaca trading mode only
            - "aggregation": Plaid aggregation mode only  
            - "hybrid": Both modes enabled
            - "disabled": No portfolio modes enabled
        """
        brokerage_enabled = self.is_enabled(FeatureFlagKey.BROKERAGE_MODE.value, user_id)
        aggregation_enabled = self.is_enabled(FeatureFlagKey.AGGREGATION_MODE.value, user_id)
        
        if brokerage_enabled and aggregation_enabled:
            return "hybrid"
        elif brokerage_enabled:
            return "brokerage"
        elif aggregation_enabled:
            return "aggregation"
        else:
            return "disabled"
    
    def reload_flags(self) -> None:
        """Reload feature flags from environment (useful for runtime updates)."""
        old_flags = self.flags.copy()
        self.flags = self._load_flags()
        
        # Log changes
        for key, new_value in self.flags.items():
            old_value = old_flags.get(key, False)
            if old_value != new_value:
                logger.info(f"🚩 Feature flag changed: {key} {old_value} → {new_value}")

# Global feature flags instance
feature_flags = FeatureFlags()

def get_feature_flags() -> FeatureFlags:
    """Get the global feature flags instance."""
    return feature_flags
