# Technical Specifications: Plaid Integration & Service Layer

## Overview
This document provides detailed technical specifications for implementing the portfolio aggregation functionality using Plaid's Investment API, while maintaining the existing architecture patterns and preparing for future brokerage re-integration.

## Service Layer Architecture

### Abstract Portfolio Provider Interface

```typescript
// File: backend/utils/portfolio/abstract_provider.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass

@dataclass
class Account:
    id: str
    provider: str
    provider_account_id: str
    account_type: str
    institution_name: str
    account_name: str
    balance: float
    is_active: bool

@dataclass  
class Position:
    symbol: str
    quantity: float
    market_value: float
    cost_basis: float
    account_id: str
    institution_name: str
    security_type: str

@dataclass
class Transaction:
    id: str
    account_id: str  
    symbol: str
    type: str  # 'buy', 'sell', 'dividend', etc.
    quantity: float
    price: float
    amount: float
    date: datetime
    description: str

@dataclass
class PerformanceData:
    total_return: float
    total_return_percentage: float
    daily_return: float
    daily_return_percentage: float
    period_returns: Dict[str, float]  # 1W, 1M, 3M, 1Y

class AbstractPortfolioProvider(ABC):
    @abstractmethod
    async def get_accounts(self, user_id: str) -> List[Account]:
        pass
    
    @abstractmethod
    async def get_positions(self, user_id: str, account_id: Optional[str] = None) -> List[Position]:
        pass
    
    @abstractmethod
    async def get_transactions(self, user_id: str, account_id: Optional[str] = None, 
                              start_date: Optional[datetime] = None) -> List[Transaction]:
        pass
    
    @abstractmethod
    async def get_performance(self, user_id: str, account_id: Optional[str] = None) -> PerformanceData:
        pass
    
    @abstractmethod
    async def refresh_data(self, user_id: str, account_id: Optional[str] = None) -> bool:
        pass
```

### Plaid Provider Implementation

```python
# File: backend/utils/portfolio/plaid_provider.py
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from plaid.api import PlaidApi
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.configuration import Configuration
from plaid.api_client import ApiClient

from .abstract_provider import AbstractPortfolioProvider, Account, Position, Transaction, PerformanceData
from ..supabase.client import get_supabase_client

logger = logging.getLogger(__name__)

class PlaidPortfolioProvider(AbstractPortfolioProvider):
    def __init__(self):
        self.client = self._initialize_plaid_client()
        self.supabase = get_supabase_client()
    
    def _initialize_plaid_client(self) -> PlaidApi:
        configuration = Configuration(
            host=getattr(plaid.environment, os.getenv('PLAID_ENV', 'sandbox')),
            api_key={
                'clientId': os.getenv('PLAID_CLIENT_ID'),
                'secret': os.getenv('PLAID_SECRET'),
            }
        )
        api_client = ApiClient(configuration)
        return PlaidApi(api_client)
    
    async def get_accounts(self, user_id: str) -> List[Account]:
        """Get all investment accounts for a user."""
        try:
            # Get user's Plaid access tokens from database
            access_tokens = await self._get_user_access_tokens(user_id)
            accounts = []
            
            for token_data in access_tokens:
                request = AccountsGetRequest(access_token=token_data['access_token'])
                response = self.client.accounts_get(request)
                
                for account in response['accounts']:
                    if account['type'] in ['investment', 'brokerage']:
                        accounts.append(Account(
                            id=f"plaid_{account['account_id']}",
                            provider='plaid',
                            provider_account_id=account['account_id'],
                            account_type=account['subtype'] or account['type'],
                            institution_name=token_data['institution_name'],
                            account_name=account.get('name', 'Investment Account'),
                            balance=account['balances']['current'] or 0.0,
                            is_active=True
                        ))
            
            return accounts
            
        except Exception as e:
            logger.error(f"Error fetching Plaid accounts for user {user_id}: {e}")
            return []
    
    async def get_positions(self, user_id: str, account_id: Optional[str] = None) -> List[Position]:
        """Get all holdings/positions for user's investment accounts."""
        try:
            access_tokens = await self._get_user_access_tokens(user_id)
            positions = []
            
            for token_data in access_tokens:
                request = InvestmentsHoldingsGetRequest(
                    access_token=token_data['access_token'],
                    account_ids=[account_id.replace('plaid_', '')] if account_id else None
                )
                response = self.client.investments_holdings_get(request)
                
                # Map securities for lookup
                securities_map = {sec['security_id']: sec for sec in response['securities']}
                accounts_map = {acc['account_id']: acc for acc in response['accounts']}
                
                for holding in response['holdings']:
                    security = securities_map.get(holding['security_id'])
                    account = accounts_map.get(holding['account_id'])
                    
                    if security and account:
                        positions.append(Position(
                            symbol=security.get('ticker_symbol', security.get('name', 'Unknown')),
                            quantity=holding.get('quantity', 0.0),
                            market_value=holding.get('value', 0.0),
                            cost_basis=holding.get('cost_basis', 0.0),
                            account_id=f"plaid_{holding['account_id']}",
                            institution_name=token_data['institution_name'],
                            security_type=security.get('type', 'equity')
                        ))
            
            return positions
            
        except Exception as e:
            logger.error(f"Error fetching Plaid positions for user {user_id}: {e}")
            return []
    
    async def get_transactions(self, user_id: str, account_id: Optional[str] = None, 
                              start_date: Optional[datetime] = None) -> List[Transaction]:
        """Get investment transactions for user's accounts."""
        try:
            access_tokens = await self._get_user_access_tokens(user_id)
            transactions = []
            
            start_date = start_date or datetime.now() - timedelta(days=365)
            end_date = datetime.now()
            
            for token_data in access_tokens:
                request = InvestmentsTransactionsGetRequest(
                    access_token=token_data['access_token'],
                    start_date=start_date.date(),
                    end_date=end_date.date(),
                    account_ids=[account_id.replace('plaid_', '')] if account_id else None
                )
                response = self.client.investments_transactions_get(request)
                
                # Map securities for lookup
                securities_map = {sec['security_id']: sec for sec in response['securities']}
                
                for txn in response['investment_transactions']:
                    security = securities_map.get(txn['security_id'])
                    
                    transactions.append(Transaction(
                        id=f"plaid_{txn['investment_transaction_id']}",
                        account_id=f"plaid_{txn['account_id']}",
                        symbol=security.get('ticker_symbol', 'Unknown') if security else 'Cash',
                        type=txn['type'],
                        quantity=txn.get('quantity', 0.0),
                        price=txn.get('price', 0.0),
                        amount=txn.get('amount', 0.0),
                        date=datetime.fromisoformat(txn['date']),
                        description=txn.get('name', '')
                    ))
            
            return transactions
            
        except Exception as e:
            logger.error(f"Error fetching Plaid transactions for user {user_id}: {e}")
            return []
    
    async def get_performance(self, user_id: str, account_id: Optional[str] = None) -> PerformanceData:
        """Calculate performance metrics from positions and transactions."""
        try:
            positions = await self.get_positions(user_id, account_id)
            transactions = await self.get_transactions(user_id, account_id)
            
            # Calculate total current value
            total_market_value = sum(pos.market_value for pos in positions)
            total_cost_basis = sum(pos.cost_basis for pos in positions)
            
            # Calculate returns
            total_return = total_market_value - total_cost_basis
            total_return_percentage = (total_return / total_cost_basis * 100) if total_cost_basis > 0 else 0
            
            # TODO: Implement period returns calculation using historical data
            period_returns = {
                '1D': 0.0,  # Placeholder - requires historical price data
                '1W': 0.0,
                '1M': 0.0,
                '3M': 0.0,
                '1Y': total_return_percentage
            }
            
            return PerformanceData(
                total_return=total_return,
                total_return_percentage=total_return_percentage,
                daily_return=0.0,  # Requires historical data
                daily_return_percentage=0.0,
                period_returns=period_returns
            )
            
        except Exception as e:
            logger.error(f"Error calculating performance for user {user_id}: {e}")
            return PerformanceData(0, 0, 0, 0, {})
    
    async def refresh_data(self, user_id: str, account_id: Optional[str] = None) -> bool:
        """Refresh cached data by re-fetching from Plaid."""
        try:
            # Clear relevant caches
            await self._clear_user_cache(user_id, account_id)
            
            # Fetch fresh data
            await self.get_accounts(user_id)
            await self.get_positions(user_id, account_id)
            
            return True
        except Exception as e:
            logger.error(f"Error refreshing data for user {user_id}: {e}")
            return False
    
    async def _get_user_access_tokens(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all Plaid access tokens for a user from database."""
        result = await self.supabase.table('user_investment_accounts')\
            .select('access_token, institution_name')\
            .eq('user_id', user_id)\
            .eq('provider', 'plaid')\
            .eq('is_active', True)\
            .execute()
        
        return result.data or []
    
    async def _clear_user_cache(self, user_id: str, account_id: Optional[str] = None):
        """Clear Redis cache for user's portfolio data."""
        # TODO: Implement Redis cache clearing logic
        pass
```

### Alpaca Provider Implementation (Preserved)

```python  
# File: backend/utils/portfolio/alpaca_provider.py
from typing import List, Optional
from datetime import datetime
from alpaca.broker import BrokerClient

from .abstract_provider import AbstractPortfolioProvider, Account, Position, Transaction, PerformanceData
from ..alpaca.broker_client_factory import get_broker_client

class AlpacaPortfolioProvider(AbstractPortfolioProvider):
    def __init__(self):
        self.client = get_broker_client()
    
    async def get_accounts(self, user_id: str) -> List[Account]:
        """Get Alpaca brokerage account."""
        # Implementation preserving existing Alpaca logic
        pass
    
    async def get_positions(self, user_id: str, account_id: Optional[str] = None) -> List[Position]:
        """Get Alpaca positions."""  
        # Implementation preserving existing Alpaca logic
        pass
    
    # ... other methods preserving existing Alpaca integration
```

### Portfolio Service (Business Logic Layer)

```python
# File: backend/utils/portfolio/portfolio_service.py
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio

from .abstract_provider import AbstractPortfolioProvider, Account, Position, Transaction, PerformanceData
from .plaid_provider import PlaidPortfolioProvider
from .alpaca_provider import AlpacaPortfolioProvider
from ..feature_flags import FeatureFlags

class PortfolioService:
    def __init__(self):
        self.providers: Dict[str, AbstractPortfolioProvider] = {
            'plaid': PlaidPortfolioProvider(),
            'alpaca': AlpacaPortfolioProvider()
        }
        self.feature_flags = FeatureFlags()
    
    async def get_user_portfolio(self, user_id: str) -> Dict[str, Any]:
        """Get complete portfolio view for user across all providers."""
        try:
            # Determine active providers based on feature flags
            active_providers = []
            
            if self.feature_flags.is_enabled('aggregation_mode', user_id):
                active_providers.append('plaid')
            
            if self.feature_flags.is_enabled('brokerage_mode', user_id):
                active_providers.append('alpaca')
            
            # Fetch data from all active providers concurrently
            tasks = []
            for provider_name in active_providers:
                provider = self.providers[provider_name]
                tasks.extend([
                    provider.get_accounts(user_id),
                    provider.get_positions(user_id),
                    provider.get_transactions(user_id)
                ])
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Aggregate results
            all_accounts = []
            all_positions = []
            all_transactions = []
            
            for i in range(0, len(results), 3):
                if not isinstance(results[i], Exception):
                    all_accounts.extend(results[i])
                if not isinstance(results[i+1], Exception):
                    all_positions.extend(results[i+1])
                if not isinstance(results[i+2], Exception):
                    all_transactions.extend(results[i+2])
            
            # Calculate aggregated metrics
            aggregated_positions = self._aggregate_positions(all_positions)
            total_value = sum(pos['market_value'] for pos in aggregated_positions)
            
            return {
                'accounts': all_accounts,
                'positions': aggregated_positions,
                'transactions': all_transactions[:50],  # Limit recent transactions
                'total_value': total_value,
                'metadata': {
                    'last_updated': datetime.now().isoformat(),
                    'providers': active_providers,
                    'account_count': len(all_accounts)
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting portfolio for user {user_id}: {e}")
            return self._empty_portfolio_response()
    
    def _aggregate_positions(self, positions: List[Position]) -> List[Dict[str, Any]]:
        """Aggregate positions by symbol across all accounts."""
        symbol_groups = {}
        
        for position in positions:
            symbol = position.symbol
            if symbol not in symbol_groups:
                symbol_groups[symbol] = {
                    'symbol': symbol,
                    'total_quantity': 0.0,
                    'total_market_value': 0.0,
                    'total_cost_basis': 0.0,
                    'accounts': [],
                    'institutions': set()
                }
            
            group = symbol_groups[symbol]
            group['total_quantity'] += position.quantity
            group['total_market_value'] += position.market_value
            group['total_cost_basis'] += position.cost_basis
            group['accounts'].append({
                'account_id': position.account_id,
                'quantity': position.quantity,
                'market_value': position.market_value,
                'institution': position.institution_name
            })
            group['institutions'].add(position.institution_name)
        
        # Convert to list and calculate averages
        aggregated = []
        for group in symbol_groups.values():
            group['institutions'] = list(group['institutions'])
            group['average_cost_basis'] = (
                group['total_cost_basis'] / group['total_quantity'] 
                if group['total_quantity'] > 0 else 0
            )
            group['unrealized_gain_loss'] = group['total_market_value'] - group['total_cost_basis']
            group['unrealized_gain_loss_percent'] = (
                (group['unrealized_gain_loss'] / group['total_cost_basis'] * 100)
                if group['total_cost_basis'] > 0 else 0
            )
            aggregated.append(group)
        
        return sorted(aggregated, key=lambda x: x['total_market_value'], reverse=True)
    
    def _empty_portfolio_response(self) -> Dict[str, Any]:
        """Return empty portfolio structure for error cases."""
        return {
            'accounts': [],
            'positions': [],
            'transactions': [],
            'total_value': 0.0,
            'metadata': {
                'last_updated': datetime.now().isoformat(),
                'providers': [],
                'account_count': 0
            }
        }
```

## Frontend Integration Specifications

### API Route Modifications

```typescript
// File: frontend-app/app/api/portfolio/positions/route.ts
import { NextResponse } from 'next/server';
import { AuthService } from '@/utils/auth/AuthService';
import { BackendService } from '@/utils/api/BackendService';

export async function GET(request: Request) {
  try {
    // Authenticate user
    const { user, accessToken } = await AuthService.authenticateWithJWT(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call backend portfolio service
    const response = await BackendService.portfolioService.getAggregatedPortfolio(
      user.id, 
      accessToken
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching aggregated portfolio:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio data' },
      { status: 500 }
    );
  }
}
```

### Backend Service Extension

```typescript  
// File: frontend-app/utils/api/BackendService.ts
export class BackendService {
  // ... existing methods

  static portfolioService = {
    async getAggregatedPortfolio(userId: string, authToken: string) {
      const response = await fetch(`${BACKEND_API_URL}/api/portfolio/aggregated`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': process.env.BACKEND_API_KEY!,
          'Authorization': `Bearer ${authToken}`,
          'X-User-ID': userId
        }
      });

      if (!response.ok) {
        throw new Error(`Portfolio API error: ${response.status}`);
      }

      return response.json();
    },

    async refreshPortfolioData(userId: string, authToken: string, accountId?: string) {
      const response = await fetch(`${BACKEND_API_URL}/api/portfolio/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': process.env.BACKEND_API_KEY!,
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ user_id: userId, account_id: accountId })
      });

      if (!response.ok) {
        throw new Error(`Portfolio refresh error: ${response.status}`);
      }

      return response.json();
    }
  };
}
```

### Component Modifications

```typescript
// File: frontend-app/components/portfolio/AggregatedHoldingsTable.tsx
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface AggregatedPosition {
  symbol: string;
  total_quantity: number;
  total_market_value: number;
  total_cost_basis: number;
  average_cost_basis: number;
  unrealized_gain_loss: number;
  unrealized_gain_loss_percent: number;
  accounts: AccountContribution[];
  institutions: string[];
}

interface AccountContribution {
  account_id: string;
  quantity: number;
  market_value: number;
  institution: string;
}

export default function AggregatedHoldingsTable({ 
  positions, 
  onSymbolClick 
}: {
  positions: AggregatedPosition[];
  onSymbolClick?: (symbol: string) => void;
}) {
  return (
    <div className="space-y-3">
      {positions.map((position) => (
        <Card key={position.symbol} className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onSymbolClick?.(position.symbol)}
                className="font-semibold text-lg hover:text-blue-600"
              >
                {position.symbol}
              </button>
              <div className="flex space-x-1">
                {position.institutions.map((institution) => (
                  <Badge key={institution} variant="outline" className="text-xs">
                    {institution}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div className="text-right">
              <div className="font-semibold">
                ${position.total_market_value.toLocaleString()}
              </div>
              <div className={`text-sm ${
                position.unrealized_gain_loss >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {position.unrealized_gain_loss >= 0 ? '+' : ''}
                ${position.unrealized_gain_loss.toLocaleString()} 
                ({position.unrealized_gain_loss_percent.toFixed(2)}%)
              </div>
            </div>
          </div>
          
          <div className="text-sm text-gray-600 mb-2">
            {position.total_quantity.toLocaleString()} shares @ avg cost ${position.average_cost_basis.toFixed(2)}
          </div>
          
          {/* Account breakdown */}
          <div className="text-xs text-gray-500 space-y-1">
            {position.accounts.map((account, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{account.institution}</span>
                <span>{account.quantity} shares • ${account.market_value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

## Database Specifications

### New Table Schemas

```sql
-- Multi-provider account connections
CREATE TABLE user_investment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('plaid', 'alpaca')),
    provider_account_id TEXT NOT NULL,
    access_token TEXT, -- Encrypted Plaid access token
    item_id TEXT, -- Plaid item ID
    institution_id TEXT, -- Plaid institution ID  
    institution_name TEXT NOT NULL,
    account_type TEXT NOT NULL, -- 'brokerage', '401k', 'ira', etc.
    account_subtype TEXT,
    account_name TEXT,
    is_active BOOLEAN DEFAULT true,
    last_synced TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure one connection per provider account
    UNIQUE(provider, provider_account_id, user_id)
);

-- Cached aggregated holdings for performance
CREATE TABLE user_aggregated_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    total_quantity DECIMAL(20, 8) DEFAULT 0,
    total_market_value DECIMAL(20, 2) DEFAULT 0,
    total_cost_basis DECIMAL(20, 2) DEFAULT 0,
    average_cost_basis DECIMAL(20, 8) DEFAULT 0,
    unrealized_gain_loss DECIMAL(20, 2) DEFAULT 0,
    unrealized_gain_loss_percent DECIMAL(10, 4) DEFAULT 0,
    account_contributions JSONB DEFAULT '[]', -- Array of account details
    institutions TEXT[] DEFAULT '{}',
    last_updated TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(user_id, symbol)
);

-- Portfolio snapshots for historical performance
CREATE TABLE user_portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    total_value DECIMAL(20, 2) DEFAULT 0,
    total_cost_basis DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss_percent DECIMAL(10, 4) DEFAULT 0,
    account_count INTEGER DEFAULT 0,
    provider_breakdown JSONB DEFAULT '{}', -- {plaid: value, alpaca: value}
    created_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(user_id, snapshot_date)
);

-- RLS Policies
ALTER TABLE user_investment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_aggregated_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- User can only access their own data
CREATE POLICY "Users can manage their investment accounts" ON user_investment_accounts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their aggregated holdings" ON user_aggregated_holdings  
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their portfolio snapshots" ON user_portfolio_snapshots
    FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_investment_accounts_user_provider ON user_investment_accounts(user_id, provider, is_active);
CREATE INDEX idx_aggregated_holdings_user ON user_aggregated_holdings(user_id, last_updated);
CREATE INDEX idx_portfolio_snapshots_user_date ON user_portfolio_snapshots(user_id, snapshot_date);
```

## API Endpoint Specifications

### Backend FastAPI Endpoints

```python
# File: backend/api_server.py (additions)
from utils.portfolio.portfolio_service import PortfolioService

portfolio_service = PortfolioService()

@app.get("/api/portfolio/aggregated")
async def get_aggregated_portfolio(
    user_id: str = Depends(get_authenticated_user_id)
):
    """Get user's complete aggregated portfolio."""
    try:
        portfolio_data = await portfolio_service.get_user_portfolio(user_id)
        return portfolio_data
    except Exception as e:
        logger.error(f"Error fetching aggregated portfolio for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch portfolio data")

@app.post("/api/portfolio/refresh")
async def refresh_portfolio_data(
    request: dict,
    user_id: str = Depends(get_authenticated_user_id)
):
    """Refresh cached portfolio data from external providers."""
    try:
        account_id = request.get('account_id')
        success = await portfolio_service.refresh_user_data(user_id, account_id)
        
        if success:
            return {"message": "Portfolio data refreshed successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to refresh portfolio data")
            
    except Exception as e:
        logger.error(f"Error refreshing portfolio for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh portfolio data")

@app.post("/api/plaid/link-investment-account") 
async def link_investment_account(
    request: dict,
    user_id: str = Depends(get_authenticated_user_id)
):
    """Link a new investment account via Plaid."""
    try:
        public_token = request.get('public_token')
        institution_id = request.get('institution_id')
        institution_name = request.get('institution_name')
        
        # Exchange public token for access token
        access_token = await exchange_public_token(public_token)
        
        # Save to database
        account_data = {
            'user_id': user_id,
            'provider': 'plaid',
            'access_token': access_token,  # Should be encrypted
            'institution_id': institution_id,
            'institution_name': institution_name
        }
        
        # TODO: Implement account linking logic
        return {"message": "Investment account linked successfully"}
        
    except Exception as e:
        logger.error(f"Error linking investment account: {e}")
        raise HTTPException(status_code=500, detail="Failed to link investment account")
```

## Feature Flag Specifications

```python
# File: backend/utils/feature_flags.py
import os
from typing import Dict, Any, Optional
from enum import Enum

class FeatureFlagKey(Enum):
    BROKERAGE_MODE = "brokerage_mode"
    AGGREGATION_MODE = "aggregation_mode" 
    TRADE_EXECUTION = "trade_execution"
    MULTI_ACCOUNT_ANALYTICS = "multi_account_analytics"
    PLAID_INVESTMENT_SYNC = "plaid_investment_sync"
    PORTFOLIO_INSIGHTS = "portfolio_insights"

class FeatureFlags:
    def __init__(self):
        self.flags = self._load_flags()
    
    def _load_flags(self) -> Dict[str, Any]:
        """Load feature flags from environment variables or config."""
        return {
            FeatureFlagKey.BROKERAGE_MODE.value: os.getenv('FF_BROKERAGE_MODE', 'false').lower() == 'true',
            FeatureFlagKey.AGGREGATION_MODE.value: os.getenv('FF_AGGREGATION_MODE', 'true').lower() == 'true',
            FeatureFlagKey.TRADE_EXECUTION.value: os.getenv('FF_TRADE_EXECUTION', 'false').lower() == 'true',
            FeatureFlagKey.MULTI_ACCOUNT_ANALYTICS.value: os.getenv('FF_MULTI_ACCOUNT_ANALYTICS', 'true').lower() == 'true',
            FeatureFlagKey.PLAID_INVESTMENT_SYNC.value: os.getenv('FF_PLAID_INVESTMENT_SYNC', 'true').lower() == 'true',
            FeatureFlagKey.PORTFOLIO_INSIGHTS.value: os.getenv('FF_PORTFOLIO_INSIGHTS', 'true').lower() == 'true'
        }
    
    def is_enabled(self, flag_key: str, user_id: Optional[str] = None) -> bool:
        """Check if a feature flag is enabled for a user."""
        if flag_key not in self.flags:
            return False
        
        # Global flag check
        if not self.flags[flag_key]:
            return False
        
        # TODO: Add user-specific flag overrides if needed
        # if user_id:
        #     user_override = self._get_user_flag_override(user_id, flag_key)
        #     if user_override is not None:
        #         return user_override
        
        return True
    
    def get_all_flags(self, user_id: Optional[str] = None) -> Dict[str, bool]:
        """Get all feature flags for a user."""
        return {key: self.is_enabled(key, user_id) for key in self.flags.keys()}
```

## Caching Strategy Specifications

```python  
# File: backend/utils/cache/portfolio_cache.py
import redis
import json
import logging
from typing import Any, Optional, Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class PortfolioCache:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            db=int(os.getenv('REDIS_DB', 0)),
            decode_responses=True
        )
        self.default_ttl = 300  # 5 minutes default TTL
    
    def get_user_portfolio(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get cached portfolio data for user."""
        try:
            key = f"portfolio:user:{user_id}"
            data = self.redis_client.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            logger.error(f"Error getting cached portfolio for {user_id}: {e}")
            return None
    
    def set_user_portfolio(self, user_id: str, portfolio_data: Dict[str, Any], ttl: int = None):
        """Cache portfolio data for user."""
        try:
            key = f"portfolio:user:{user_id}"
            ttl = ttl or self.default_ttl
            
            # Add cache metadata
            portfolio_data['cache_info'] = {
                'cached_at': datetime.now().isoformat(),
                'ttl': ttl
            }
            
            self.redis_client.setex(key, ttl, json.dumps(portfolio_data))
        except Exception as e:
            logger.error(f"Error caching portfolio for {user_id}: {e}")
    
    def invalidate_user_cache(self, user_id: str, pattern: Optional[str] = None):
        """Invalidate cached data for user."""
        try:
            if pattern:
                keys = self.redis_client.keys(f"portfolio:user:{user_id}:{pattern}")
            else:
                keys = self.redis_client.keys(f"portfolio:user:{user_id}*")
            
            if keys:
                self.redis_client.delete(*keys)
        except Exception as e:
            logger.error(f"Error invalidating cache for {user_id}: {e}")
```

This technical specification provides the foundational architecture for implementing the portfolio aggregation pivot while maintaining clean separation of concerns and preparing for future brokerage re-integration. The next document will detail the specific implementation roadmap with timelines and milestones.
