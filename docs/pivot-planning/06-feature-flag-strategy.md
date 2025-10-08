# Feature Flag Implementation Strategy

## Overview
This document outlines a comprehensive feature flag system to enable seamless toggling between brokerage mode and portfolio aggregation mode, ensuring clean code separation and easy future re-enablement of trading functionality.

## Feature Flag Philosophy

### Core Principles
1. **Clean Separation**: Feature flags should not create technical debt
2. **Performance First**: Minimal runtime overhead for flag evaluation
3. **Easy Rollback**: Any feature can be disabled instantly without code deployment
4. **Granular Control**: Different flag levels for different user groups
5. **Monitoring**: Full visibility into feature usage and performance impact

### Flag Evaluation Strategy
- **Server-side evaluation**: Security-sensitive features (trading, payments)
- **Client-side caching**: UI features with performance considerations
- **Database overrides**: User-specific flag customization
- **Environment-based defaults**: Different behavior per environment

---

## Feature Flag Architecture

### Flag Categories and Hierarchy

```typescript
enum FeatureFlagCategory {
  CORE_FUNCTIONALITY = 'core',
  USER_INTERFACE = 'ui', 
  BUSINESS_LOGIC = 'business',
  INTEGRATIONS = 'integrations',
  EXPERIMENTAL = 'experimental'
}

enum FeatureFlagLevel {
  GLOBAL = 'global',           // All users
  USER_SEGMENT = 'segment',    // User segments (premium, beta, etc.)
  USER_SPECIFIC = 'user',      // Individual users
  ADMIN_OVERRIDE = 'admin'     // Admin emergency controls
}
```

### Core Feature Flags Definition

```typescript
// File: types/feature-flags.ts
export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  category: FeatureFlagCategory;
  level: FeatureFlagLevel;
  defaultValue: boolean;
  environments: {
    development: boolean;
    staging: boolean;
    production: boolean;
  };
  dependencies?: string[]; // Other flags this depends on
  conflicts?: string[];    // Flags that conflict with this one
  rolloutPercentage?: number; // Gradual rollout percentage
  expiresAt?: string;     // ISO date when flag should be removed
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  // === CORE FUNCTIONALITY FLAGS ===
  BROKERAGE_MODE: {
    key: 'brokerage_mode',
    name: 'Brokerage Trading Mode',
    description: 'Enable full brokerage trading functionality with Alpaca integration',
    category: FeatureFlagCategory.CORE_FUNCTIONALITY,
    level: FeatureFlagLevel.GLOBAL,
    defaultValue: false, // Disabled by default after pivot
    environments: {
      development: true,   // Keep enabled in dev for testing
      staging: false,
      production: false
    },
    conflicts: ['aggregation_only_mode'],
    expiresAt: '2025-12-31' // Review after one year
  },

  AGGREGATION_MODE: {
    key: 'aggregation_mode', 
    name: 'Portfolio Aggregation Mode',
    description: 'Enable multi-account portfolio aggregation via Plaid',
    category: FeatureFlagCategory.CORE_FUNCTIONALITY,
    level: FeatureFlagLevel.GLOBAL,
    defaultValue: true, // Primary mode after pivot
    environments: {
      development: true,
      staging: true,
      production: true
    }
  },

  AGGREGATION_ONLY_MODE: {
    key: 'aggregation_only_mode',
    name: 'Aggregation Only Mode (No Trading)',
    description: 'Disable all trading features, show aggregation only',
    category: FeatureFlagCategory.CORE_FUNCTIONALITY,
    level: FeatureFlagLevel.GLOBAL,
    defaultValue: true, // Default after pivot
    environments: {
      development: false,  // Allow testing both modes in dev
      staging: true,
      production: true
    },
    conflicts: ['brokerage_mode']
  },

  // === TRADING-SPECIFIC FLAGS ===
  TRADE_EXECUTION: {
    key: 'trade_execution',
    name: 'Trade Execution',
    description: 'Allow users to execute buy/sell orders',
    category: FeatureFlagCategory.BUSINESS_LOGIC,
    level: FeatureFlagLevel.USER_SEGMENT,
    defaultValue: false,
    environments: {
      development: true,
      staging: false, 
      production: false
    },
    dependencies: ['brokerage_mode']
  },

  ORDER_MANAGEMENT: {
    key: 'order_management',
    name: 'Order Management',
    description: 'Show pending orders, order history, and order modifications',
    category: FeatureFlagCategory.USER_INTERFACE,
    level: FeatureFlagLevel.GLOBAL,
    defaultValue: false,
    environments: {
      development: true,
      staging: false,
      production: false
    },
    dependencies: ['brokerage_mode']
  },

  // === AGGREGATION FEATURES ===
  MULTI_ACCOUNT_ANALYTICS: {
    key: 'multi_account_analytics',
    name: 'Multi-Account Analytics',
    description: 'Advanced analytics across multiple connected accounts',
    category: FeatureFlagCategory.BUSINESS_LOGIC,
    level: FeatureFlagLevel.GLOBAL,
    defaultValue: true,
    environments: {
      development: true,
      staging: true,
      production: true
    },
    dependencies: ['aggregation_mode']
  },

  PLAID_INVESTMENT_SYNC: {
    key: 'plaid_investment_sync',
    name: 'Plaid Investment Data Sync',
    description: 'Automatic syncing of investment data from Plaid',
    category: FeatureFlagCategory.INTEGRATIONS,
    level: FeatureFlagLevel.GLOBAL,
    defaultValue: true,
    environments: {
      development: true,
      staging: true,
      production: true
    }
  },

  // === UI FEATURE FLAGS ===
  PORTFOLIO_INSIGHTS: {
    key: 'portfolio_insights',
    name: 'AI Portfolio Insights',
    description: 'AI-generated portfolio insights and recommendations',
    category: FeatureFlagCategory.USER_INTERFACE,
    level: FeatureFlagLevel.USER_SEGMENT,
    defaultValue: true,
    environments: {
      development: true,
      staging: true,
      production: true
    },
    rolloutPercentage: 100
  },

  // === REVENUE MODEL FLAGS ===
  SUBSCRIPTION_BILLING: {
    key: 'subscription_billing',
    name: 'Subscription Billing',
    description: 'Premium subscription tiers and billing',
    category: FeatureFlagCategory.BUSINESS_LOGIC,
    level: FeatureFlagLevel.GLOBAL,
    defaultValue: false, // Enable in Phase 3
    environments: {
      development: true,
      staging: false,
      production: false
    }
  },

  // === EXPERIMENTAL FLAGS ===
  AI_TRADE_SUGGESTIONS: {
    key: 'ai_trade_suggestions',
    name: 'AI Trade Suggestions',
    description: 'AI agents can suggest trades (no execution)',
    category: FeatureFlagCategory.EXPERIMENTAL,
    level: FeatureFlagLevel.USER_SEGMENT,
    defaultValue: false,
    environments: {
      development: true,
      staging: false,
      production: false
    },
    rolloutPercentage: 10, // Limited beta
    conflicts: ['trade_execution']
  }
};
```

---

## Backend Implementation

### Feature Flag Service

```python
# File: backend/utils/feature_flags/service.py
import os
import logging
from typing import Dict, Any, Optional, List
from enum import Enum
import redis
import json
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

class FeatureFlagLevel(Enum):
    GLOBAL = "global"
    USER_SEGMENT = "segment" 
    USER_SPECIFIC = "user"
    ADMIN_OVERRIDE = "admin"

@dataclass
class FeatureFlagContext:
    user_id: Optional[str] = None
    user_segment: Optional[str] = None
    environment: str = "production"
    admin_override: bool = False

class FeatureFlagService:
    def __init__(self):
        self.redis_client = self._initialize_redis()
        self.environment = os.getenv('ENVIRONMENT', 'production')
        self.flags_config = self._load_flags_config()
        
    def _initialize_redis(self) -> redis.Redis:
        """Initialize Redis client for caching flag evaluations."""
        return redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            db=int(os.getenv('REDIS_FLAGS_DB', 1)),
            decode_responses=True
        )
    
    def _load_flags_config(self) -> Dict[str, Any]:
        """Load feature flags configuration from environment and database."""
        # Default configuration from environment variables
        flags = {}
        
        # Core functionality flags
        flags['brokerage_mode'] = self._env_bool('FF_BROKERAGE_MODE', False)
        flags['aggregation_mode'] = self._env_bool('FF_AGGREGATION_MODE', True)
        flags['aggregation_only_mode'] = self._env_bool('FF_AGGREGATION_ONLY_MODE', True)
        
        # Trading flags
        flags['trade_execution'] = self._env_bool('FF_TRADE_EXECUTION', False)
        flags['order_management'] = self._env_bool('FF_ORDER_MANAGEMENT', False)
        
        # Aggregation flags
        flags['multi_account_analytics'] = self._env_bool('FF_MULTI_ACCOUNT_ANALYTICS', True)
        flags['plaid_investment_sync'] = self._env_bool('FF_PLAID_INVESTMENT_SYNC', True)
        flags['portfolio_insights'] = self._env_bool('FF_PORTFOLIO_INSIGHTS', True)
        flags['referral_links'] = self._env_bool('FF_REFERRAL_LINKS', True)
        
        # Revenue model flags
        flags['subscription_billing'] = self._env_bool('FF_SUBSCRIPTION_BILLING', False)
        flags['advisory_fees'] = self._env_bool('FF_ADVISORY_FEES', False)
        
        # Experimental flags
        flags['ai_trade_suggestions'] = self._env_bool('FF_AI_TRADE_SUGGESTIONS', False)
        
        return flags
    
    def _env_bool(self, env_var: str, default: bool) -> bool:
        """Convert environment variable to boolean."""
        value = os.getenv(env_var, str(default)).lower()
        return value in ('true', '1', 'yes', 'on')
    
    async def is_enabled(self, flag_key: str, context: FeatureFlagContext) -> bool:
        """
        Check if a feature flag is enabled for the given context.
        
        Evaluation order:
        1. Admin override (highest priority)
        2. User-specific override
        3. User segment rules
        4. Global configuration
        5. Environment default
        """
        try:
            # Check cache first
            cache_key = f"ff:{flag_key}:{context.user_id}:{context.environment}"
            cached_result = self.redis_client.get(cache_key)
            
            if cached_result is not None:
                return json.loads(cached_result)
            
            # Admin override check
            if context.admin_override:
                admin_value = await self._get_admin_override(flag_key, context.user_id)
                if admin_value is not None:
                    await self._cache_result(cache_key, admin_value, ttl=60) # 1 min cache
                    return admin_value
            
            # User-specific override
            if context.user_id:
                user_value = await self._get_user_override(flag_key, context.user_id)
                if user_value is not None:
                    await self._cache_result(cache_key, user_value, ttl=300) # 5 min cache
                    return user_value
            
            # User segment rules
            if context.user_segment:
                segment_value = await self._get_segment_override(flag_key, context.user_segment)
                if segment_value is not None:
                    await self._cache_result(cache_key, segment_value, ttl=300)
                    return segment_value
            
            # Global configuration
            global_value = self.flags_config.get(flag_key)
            if global_value is not None:
                await self._cache_result(cache_key, global_value, ttl=900) # 15 min cache
                return global_value
            
            # Default to false for unknown flags
            await self._cache_result(cache_key, False, ttl=900)
            return False
            
        except Exception as e:
            logger.error(f"Error evaluating feature flag {flag_key}: {e}")
            # Fallback to global config or False
            return self.flags_config.get(flag_key, False)
    
    async def get_all_flags(self, context: FeatureFlagContext) -> Dict[str, bool]:
        """Get all feature flags for a context."""
        result = {}
        for flag_key in self.flags_config.keys():
            result[flag_key] = await self.is_enabled(flag_key, context)
        return result
    
    async def _get_admin_override(self, flag_key: str, user_id: Optional[str]) -> Optional[bool]:
        """Check for admin override in database."""
        # Implementation would query database for admin overrides
        # This is a placeholder for the actual database query
        return None
    
    async def _get_user_override(self, flag_key: str, user_id: str) -> Optional[bool]:
        """Check for user-specific override in database."""
        from ..supabase.client import get_supabase_client
        
        try:
            supabase = get_supabase_client()
            result = await supabase.table('user_feature_flags')\
                .select('enabled')\
                .eq('user_id', user_id)\
                .eq('flag_name', flag_key)\
                .eq('expires_at', None)\
                .or_('expires_at.gt', datetime.now().isoformat())\
                .single()
            
            return result.data['enabled'] if result.data else None
            
        except Exception as e:
            logger.warning(f"Error checking user override for {flag_key}: {e}")
            return None
    
    async def _get_segment_override(self, flag_key: str, segment: str) -> Optional[bool]:
        """Check for segment-specific rules."""
        # Placeholder for segment-based rules
        # Could be implemented with more complex database queries or external service
        return None
    
    async def _cache_result(self, cache_key: str, value: bool, ttl: int):
        """Cache the flag evaluation result."""
        try:
            self.redis_client.setex(cache_key, ttl, json.dumps(value))
        except Exception as e:
            logger.warning(f"Failed to cache feature flag result: {e}")

# Global instance
feature_flag_service = FeatureFlagService()

# Dependency for FastAPI
async def get_feature_flags(user_id: str = None) -> FeatureFlagService:
    """FastAPI dependency to get feature flag service."""
    return feature_flag_service

# Decorator for feature-gated endpoints
def feature_required(flag_key: str):
    """Decorator to require a feature flag for API endpoints."""
    def decorator(func):
        async def wrapper(*args, user_id: str = None, **kwargs):
            context = FeatureFlagContext(user_id=user_id)
            if not await feature_flag_service.is_enabled(flag_key, context):
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=403,
                    detail=f"Feature '{flag_key}' is not enabled for this user"
                )
            return await func(*args, user_id=user_id, **kwargs)
        return wrapper
    return decorator
```

### API Endpoint Implementation

```python
# File: backend/api_server.py (additions)
from utils.feature_flags.service import feature_required, get_feature_flags, FeatureFlagContext

# Trading endpoints with feature flags
@app.post("/api/trade")
@feature_required('trade_execution')
async def execute_trade(
    trade_request: TradeRequest,
    user_id: str = Depends(get_authenticated_user_id)
):
    """Execute a trade order - only available when trade_execution flag is enabled."""
    # Existing trade execution logic
    pass

@app.get("/api/portfolio/{account_id}/orders") 
@feature_required('order_management')
async def get_orders(
    account_id: str,
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get user's orders - only when order_management flag is enabled."""
    # Existing order retrieval logic
    pass

# New aggregation endpoints
@app.get("/api/portfolio/aggregated")
@feature_required('aggregation_mode')
async def get_aggregated_portfolio(
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get aggregated portfolio - only when aggregation_mode is enabled."""
    # Aggregated portfolio logic
    pass

# Feature flag information endpoint
@app.get("/api/user/feature-flags")
async def get_user_feature_flags(
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get all feature flags for the current user."""
    context = FeatureFlagContext(user_id=user_id)
    flags = await feature_flag_service.get_all_flags(context)
    
    return {
        "user_id": user_id,
        "flags": flags,
        "environment": feature_flag_service.environment
    }
```

---

## Frontend Implementation

### React Feature Flag Context

```typescript
// File: frontend-app/contexts/FeatureFlagContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUser } from '@/hooks/useUser';

interface FeatureFlags {
  brokerage_mode: boolean;
  aggregation_mode: boolean;
  aggregation_only_mode: boolean;
  trade_execution: boolean;
  order_management: boolean;
  multi_account_analytics: boolean;
  plaid_investment_sync: boolean;
  portfolio_insights: boolean;
  referral_links: boolean;
  subscription_billing: boolean;
  advisory_fees: boolean;
  ai_trade_suggestions: boolean;
}

interface FeatureFlagContextType {
  flags: FeatureFlags;
  loading: boolean;
  error: string | null;
  refreshFlags: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextType | undefined>(undefined);

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [flags, setFlags] = useState<FeatureFlags>({} as FeatureFlags);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        // Default flags for non-authenticated users
        setFlags({
          brokerage_mode: false,
          aggregation_mode: true,
          aggregation_only_mode: true,
          trade_execution: false,
          order_management: false,
          multi_account_analytics: true,
          plaid_investment_sync: true,
          portfolio_insights: true,
          referral_links: true,
          subscription_billing: false,
          advisory_fees: false,
          ai_trade_suggestions: false,
        });
        return;
      }

      const response = await fetch('/api/user/feature-flags', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch feature flags');
      }

      const data = await response.json();
      setFlags(data.flags);
    } catch (err) {
      console.error('Error fetching feature flags:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Fallback to safe defaults
      setFlags({
        brokerage_mode: false,
        aggregation_mode: true,
        aggregation_only_mode: true,
        trade_execution: false,
        order_management: false,
        multi_account_analytics: true,
        plaid_investment_sync: true,
        portfolio_insights: true,
        referral_links: true,
        subscription_billing: false,
        advisory_fees: false,
        ai_trade_suggestions: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, [user?.id]);

  const refreshFlags = async () => {
    await fetchFlags();
  };

  return (
    <FeatureFlagContext.Provider value={{ flags, loading, error, refreshFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = (): FeatureFlagContextType => {
  const context = useContext(FeatureFlagContext);
  if (context === undefined) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  return context;
};

// Convenience hooks for common flag checks
export const useCanTrade = () => {
  const { flags } = useFeatureFlags();
  return flags.brokerage_mode && flags.trade_execution;
};

export const useIsAggregationMode = () => {
  const { flags } = useFeatureFlags();
  return flags.aggregation_mode;
};

export const useShowOrderManagement = () => {
  const { flags } = useFeatureFlags();
  return flags.brokerage_mode && flags.order_management;
};
```

### Feature Flag Components

```typescript
// File: frontend-app/components/FeatureFlag.tsx
import React from 'react';
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';

interface FeatureFlagProps {
  flag: keyof FeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
}

export const FeatureFlag: React.FC<FeatureFlagProps> = ({ 
  flag, 
  children, 
  fallback = null, 
  loading = null 
}) => {
  const { flags, loading: flagsLoading } = useFeatureFlags();

  if (flagsLoading && loading) {
    return <>{loading}</>;
  }

  if (!flags[flag]) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

// Higher-order component for feature gating
export const withFeatureFlag = <P extends object>(
  flag: keyof FeatureFlags,
  fallbackComponent?: React.ComponentType<P>
) => {
  return (Component: React.ComponentType<P>) => {
    const FeatureGatedComponent: React.FC<P> = (props) => (
      <FeatureFlag 
        flag={flag}
        fallback={fallbackComponent ? <fallbackComponent {...props} /> : null}
      >
        <Component {...props} />
      </FeatureFlag>
    );

    FeatureGatedComponent.displayName = `withFeatureFlag(${Component.displayName || Component.name})`;
    return FeatureGatedComponent;
  };
};

// Conditional rendering hook
export const useFeatureFlag = (flag: keyof FeatureFlags): boolean => {
  const { flags } = useFeatureFlags();
  return flags[flag];
};
```

### Component Usage Examples

```typescript
// File: frontend-app/app/portfolio/page.tsx (updated)
import { FeatureFlag, useCanTrade, useShowOrderManagement } from '@/components/FeatureFlag';
import { OrderModal } from '@/components/invest/OrderModal';
import { ReferralBanner } from '@/components/referral/ReferralBanner';

export default function PortfolioPage() {
  const canTrade = useCanTrade();
  const showOrderManagement = useShowOrderManagement();

  return (
    <div>
      {/* Portfolio content always shown */}
      <PortfolioSummary />
      <HoldingsTable />

      {/* Trading features - only shown when flags enabled */}
      <FeatureFlag flag="trade_execution">
        <div className="trading-section">
          <h3>Quick Actions</h3>
          <TradeButtons />
        </div>
      </FeatureFlag>

      {/* Order management - conditional */}
      <FeatureFlag 
        flag="order_management"
        fallback={
          <FeatureFlag flag="referral_links">
            <ReferralBanner message="Want to trade? Connect with our partner brokers!" />
          </FeatureFlag>
        }
      >
        <OrderManagementSection />
      </FeatureFlag>

      {/* Aggregation features */}
      <FeatureFlag flag="multi_account_analytics">
        <MultiAccountAnalytics />
      </FeatureFlag>

      <FeatureFlag flag="portfolio_insights">
        <AIInsightsPanel />
      </FeatureFlag>
    </div>
  );
}
```

---

## AI Agent Feature Flag Integration

### Agent Configuration

```python
# File: backend/clera_agents/feature_aware_agents.py
from typing import Dict, Any
from utils.feature_flags.service import feature_flag_service, FeatureFlagContext

class FeatureAwareAgent:
    """Base class for agents that respect feature flags."""
    
    def __init__(self, agent_name: str):
        self.agent_name = agent_name
        self.feature_flags = feature_flag_service
    
    async def get_capabilities(self, user_id: str) -> Dict[str, bool]:
        """Get agent capabilities based on feature flags."""
        context = FeatureFlagContext(user_id=user_id)
        
        return {
            'can_execute_trades': await self.feature_flags.is_enabled('trade_execution', context),
            'can_suggest_trades': await self.feature_flags.is_enabled('ai_trade_suggestions', context),
            'can_analyze_portfolio': await self.feature_flags.is_enabled('portfolio_insights', context),
            'can_access_multi_account': await self.feature_flags.is_enabled('multi_account_analytics', context),
            'brokerage_mode': await self.feature_flags.is_enabled('brokerage_mode', context),
            'aggregation_mode': await self.feature_flags.is_enabled('aggregation_mode', context),
        }

class TradeExecutionAgent(FeatureAwareAgent):
    """Trade execution agent with feature flag awareness."""
    
    def __init__(self):
        super().__init__('trade_execution')
    
    async def execute_trade(self, user_id: str, trade_request: Dict[str, Any]) -> str:
        """Execute trade only if feature flags allow."""
        capabilities = await self.get_capabilities(user_id)
        
        if not capabilities['can_execute_trades']:
            return self._generate_advisory_response(trade_request)
        
        if not capabilities['brokerage_mode']:
            return "Trading is currently not available. Contact support for more information."
        
        # Execute actual trade
        return await self._execute_alpaca_trade(trade_request)
    
    def _generate_advisory_response(self, trade_request: Dict[str, Any]) -> str:
        """Generate educational response when trading is disabled."""
        symbol = trade_request.get('symbol', 'the security')
        action = trade_request.get('side', 'trade')
        
        return f"""
        I understand you want to {action} {symbol}. While I can't execute trades directly right now, 
        I can provide some guidance:

        1. **Analysis**: Based on current market conditions and your portfolio, this appears to be 
           a {self._analyze_trade_merit(trade_request)} decision.

        2. **Execution Options**: You can execute this trade through:
           - Your existing brokerage account
           - Our partner brokerages (see referral links)
           - Contact our advisory team for assistance

        3. **Considerations**: Before executing, consider the tax implications and how this fits 
           into your overall portfolio allocation.

        Would you like me to provide more detailed analysis of this investment decision?
        """
    
    async def _execute_alpaca_trade(self, trade_request: Dict[str, Any]) -> str:
        """Execute actual trade via Alpaca (preserved code)."""
        # Existing Alpaca trade execution logic
        pass
    
    def _analyze_trade_merit(self, trade_request: Dict[str, Any]) -> str:
        """Analyze whether the trade is a good idea."""
        # Simple analysis logic
        return "potentially beneficial"
```

### LangGraph Integration

```python  
# File: backend/clera_agents/graph.py (updated)
from langgraph import StateGraph
from .feature_aware_agents import FeatureAwareAgent

async def create_agent_graph(user_id: str) -> StateGraph:
    """Create agent graph with feature flag awareness."""
    
    # Get user capabilities
    feature_context = FeatureFlagContext(user_id=user_id)
    capabilities = await feature_flag_service.get_all_flags(feature_context)
    
    # Create graph based on capabilities
    graph = StateGraph()
    
    # Always include these agents
    graph.add_node("financial_analyst", financial_analyst_node)
    graph.add_node("portfolio_manager", portfolio_manager_node)
    
    # Conditionally include trade execution
    if capabilities.get('trade_execution', False):
        graph.add_node("trade_executor", trade_executor_node)
        graph.add_edge("portfolio_manager", "trade_executor")
    else:
        # Route to advisory-only node
        graph.add_node("trade_advisor", trade_advisor_node) 
        graph.add_edge("portfolio_manager", "trade_advisor")
    
    # Add aggregation capabilities if enabled
    if capabilities.get('multi_account_analytics', False):
        graph.add_node("aggregation_analyzer", aggregation_analyzer_node)
        graph.add_edge("START", "aggregation_analyzer")
    
    return graph
```

---

## Monitoring and Analytics

### Feature Flag Usage Tracking

```python
# File: backend/utils/feature_flags/analytics.py
import logging
from typing import Dict, Any, Optional
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

class FeatureFlagAnalytics:
    """Track feature flag usage and performance."""
    
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            db=int(os.getenv('REDIS_ANALYTICS_DB', 2)),
            decode_responses=True
        )
    
    async def track_flag_evaluation(
        self, 
        flag_key: str, 
        user_id: Optional[str], 
        result: bool,
        evaluation_time_ms: float
    ):
        """Track each flag evaluation for analytics."""
        try:
            # Increment daily counters
            date_key = datetime.now().strftime('%Y-%m-%d')
            
            # Overall usage
            await self.redis_client.hincrby(f"flag_usage:{date_key}", flag_key, 1)
            
            # Result breakdown
            result_key = f"flag_results:{date_key}:{flag_key}"
            await self.redis_client.hincrby(result_key, str(result), 1)
            
            # Performance tracking
            perf_key = f"flag_performance:{date_key}:{flag_key}"
            await self.redis_client.lpush(perf_key, evaluation_time_ms)
            await self.redis_client.ltrim(perf_key, 0, 999)  # Keep last 1000 measurements
            
            # User tracking (if provided)
            if user_id:
                user_key = f"user_flags:{user_id}:{date_key}"
                await self.redis_client.sadd(user_key, flag_key)
                await self.redis_client.expire(user_key, 86400 * 7)  # 7 days
                
        except Exception as e:
            logger.error(f"Error tracking flag evaluation: {e}")
    
    async def get_flag_stats(self, flag_key: str, days: int = 7) -> Dict[str, Any]:
        """Get usage statistics for a feature flag."""
        try:
            stats = {
                'flag_key': flag_key,
                'total_evaluations': 0,
                'true_results': 0,
                'false_results': 0,
                'avg_evaluation_time_ms': 0,
                'daily_breakdown': []
            }
            
            total_evaluations = 0
            total_true = 0
            total_false = 0
            total_time = 0
            measurements = 0
            
            # Collect data for each day
            for i in range(days):
                date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
                
                # Daily usage
                daily_usage = await self.redis_client.hget(f"flag_usage:{date}", flag_key) or 0
                daily_true = await self.redis_client.hget(f"flag_results:{date}:{flag_key}", 'True') or 0
                daily_false = await self.redis_client.hget(f"flag_results:{date}:{flag_key}", 'False') or 0
                
                # Performance data
                perf_data = await self.redis_client.lrange(f"flag_performance:{date}:{flag_key}", 0, -1)
                daily_avg_time = sum(float(x) for x in perf_data) / len(perf_data) if perf_data else 0
                
                stats['daily_breakdown'].append({
                    'date': date,
                    'evaluations': int(daily_usage),
                    'true_results': int(daily_true),
                    'false_results': int(daily_false),
                    'avg_time_ms': daily_avg_time
                })
                
                # Accumulate totals
                total_evaluations += int(daily_usage)
                total_true += int(daily_true)
                total_false += int(daily_false)
                if perf_data:
                    total_time += sum(float(x) for x in perf_data)
                    measurements += len(perf_data)
            
            stats['total_evaluations'] = total_evaluations
            stats['true_results'] = total_true
            stats['false_results'] = total_false
            stats['avg_evaluation_time_ms'] = total_time / measurements if measurements > 0 else 0
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting flag stats: {e}")
            return {'error': str(e)}
```

### Dashboard API

```python
# File: backend/api_server.py (admin endpoints)
@app.get("/api/admin/feature-flags/stats/{flag_key}")
async def get_feature_flag_stats(
    flag_key: str,
    days: int = 7,
    admin_user: str = Depends(require_admin)  # Implement admin auth
):
    """Get feature flag usage statistics."""
    analytics = FeatureFlagAnalytics()
    stats = await analytics.get_flag_stats(flag_key, days)
    return stats

@app.get("/api/admin/feature-flags")
async def list_all_feature_flags(admin_user: str = Depends(require_admin)):
    """List all feature flags and their current status."""
    flags_config = feature_flag_service.flags_config
    
    # Get usage stats for each flag
    analytics = FeatureFlagAnalytics()
    flags_with_stats = []
    
    for flag_key, enabled in flags_config.items():
        stats = await analytics.get_flag_stats(flag_key, 1)  # Today's stats
        flags_with_stats.append({
            'key': flag_key,
            'enabled': enabled,
            'evaluations_today': stats.get('total_evaluations', 0),
            'true_rate': stats.get('true_results', 0) / max(stats.get('total_evaluations', 1), 1)
        })
    
    return flags_with_stats

@app.post("/api/admin/feature-flags/{flag_key}/toggle")
async def toggle_feature_flag(
    flag_key: str,
    enabled: bool,
    admin_user: str = Depends(require_admin)
):
    """Toggle a feature flag globally."""
    # Update environment variable or configuration store
    # This implementation depends on your configuration management
    
    # For immediate effect, update the in-memory config
    feature_flag_service.flags_config[flag_key] = enabled
    
    # Clear related caches
    cache_pattern = f"ff:{flag_key}:*"
    keys_to_delete = await feature_flag_service.redis_client.keys(cache_pattern)
    if keys_to_delete:
        await feature_flag_service.redis_client.delete(*keys_to_delete)
    
    return {
        'flag_key': flag_key,
        'enabled': enabled,
        'updated_by': admin_user,
        'updated_at': datetime.now().isoformat()
    }
```

---

## Testing Strategy

### Feature Flag Testing Framework

```python
# File: backend/tests/test_feature_flags.py
import pytest
from utils.feature_flags.service import FeatureFlagService, FeatureFlagContext

@pytest.fixture
async def feature_service():
    """Create a feature flag service for testing."""
    return FeatureFlagService()

@pytest.mark.asyncio
async def test_basic_flag_evaluation(feature_service):
    """Test basic feature flag evaluation."""
    context = FeatureFlagContext(user_id="test_user")
    
    # Test default behavior
    result = await feature_service.is_enabled("aggregation_mode", context)
    assert result == True  # Default should be True
    
    result = await feature_service.is_enabled("trade_execution", context) 
    assert result == False  # Default should be False

@pytest.mark.asyncio  
async def test_user_override(feature_service):
    """Test user-specific flag overrides."""
    context = FeatureFlagContext(user_id="premium_user")
    
    # Mock database response for user override
    with patch.object(feature_service, '_get_user_override', return_value=True):
        result = await feature_service.is_enabled("trade_execution", context)
        assert result == True

@pytest.mark.asyncio
async def test_admin_override(feature_service):
    """Test admin override functionality.""" 
    context = FeatureFlagContext(user_id="test_user", admin_override=True)
    
    with patch.object(feature_service, '_get_admin_override', return_value=True):
        result = await feature_service.is_enabled("trade_execution", context)
        assert result == True

@pytest.mark.asyncio
async def test_caching_behavior(feature_service):
    """Test that flag evaluations are cached properly."""
    context = FeatureFlagContext(user_id="test_user")
    
    # First call should hit the database
    with patch.object(feature_service, '_get_user_override') as mock_db:
        mock_db.return_value = None
        result1 = await feature_service.is_enabled("aggregation_mode", context)
        
    # Second call should use cache
    with patch.object(feature_service, '_get_user_override') as mock_db:
        mock_db.return_value = None
        result2 = await feature_service.is_enabled("aggregation_mode", context)
        
    assert result1 == result2
    mock_db.assert_not_called()  # Should not call DB on second attempt

class TestFeatureFlagDecorator:
    """Test the feature_required decorator."""
    
    @pytest.mark.asyncio
    async def test_feature_required_allowed(self):
        """Test that decorated function executes when flag is enabled."""
        
        @feature_required('aggregation_mode')
        async def test_endpoint(user_id: str):
            return {"success": True, "user_id": user_id}
        
        with patch.object(feature_flag_service, 'is_enabled', return_value=True):
            result = await test_endpoint(user_id="test_user")
            assert result["success"] == True
    
    @pytest.mark.asyncio  
    async def test_feature_required_forbidden(self):
        """Test that decorated function raises 403 when flag is disabled."""
        from fastapi import HTTPException
        
        @feature_required('trade_execution')
        async def test_endpoint(user_id: str):
            return {"success": True}
        
        with patch.object(feature_flag_service, 'is_enabled', return_value=False):
            with pytest.raises(HTTPException) as exc_info:
                await test_endpoint(user_id="test_user")
            
            assert exc_info.value.status_code == 403
```

### Frontend Testing

```typescript
// File: frontend-app/tests/feature-flags.test.tsx
import { render, screen } from '@testing-library/react';
import { FeatureFlag, FeatureFlagProvider } from '@/contexts/FeatureFlagContext';

// Mock the fetch API
global.fetch = jest.fn();

describe('FeatureFlag Component', () => {
  const mockFlags = {
    brokerage_mode: false,
    aggregation_mode: true,
    trade_execution: false,
    order_management: false,
    // ... other flags
  };

  beforeEach(() => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flags: mockFlags }),
    });
  });

  test('shows content when flag is enabled', async () => {
    render(
      <FeatureFlagProvider>
        <FeatureFlag flag="aggregation_mode">
          <div>Aggregation Feature</div>
        </FeatureFlag>
      </FeatureFlagProvider>
    );

    // Wait for flags to load
    await screen.findByText('Aggregation Feature');
    expect(screen.getByText('Aggregation Feature')).toBeInTheDocument();
  });

  test('shows fallback when flag is disabled', async () => {
    render(
      <FeatureFlagProvider>
        <FeatureFlag 
          flag="trade_execution" 
          fallback={<div>Trading Disabled</div>}
        >
          <div>Trading Feature</div>
        </FeatureFlag>
      </FeatureFlagProvider>
    );

    await screen.findByText('Trading Disabled');
    expect(screen.getByText('Trading Disabled')).toBeInTheDocument();
    expect(screen.queryByText('Trading Feature')).not.toBeInTheDocument();
  });

  test('handles loading state', () => {
    // Mock loading state
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(
      <FeatureFlagProvider>
        <FeatureFlag 
          flag="aggregation_mode"
          loading={<div>Loading...</div>}
        >
          <div>Content</div>
        </FeatureFlag>
      </FeatureFlagProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
```

This comprehensive feature flag strategy ensures clean separation of brokerage and aggregation functionality while maintaining the ability to easily toggle features on/off without code deployments.
