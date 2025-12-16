# SnapTrade Complete Implementation Plan

## Executive Summary

This document outlines the **production-grade, systematic implementation** of SnapTrade integration, replacing Plaid while preserving hybrid mode capabilities.

## Analysis Summary

### Current Architecture (Discovered)

**Backend:**
- ✅ Abstract provider pattern (`AbstractPortfolioProvider`)
- ✅ Plaid provider fully implemented
- ✅ Alpaca provider for brokerage
- ✅ Portfolio mode service (brokerage/aggregation/hybrid)
- ✅ Real-time WebSocket system (Redis + Alpaca market data)
- ✅ Portfolio history reconstruction (Plaid transactions → historical snapshots)
- ✅ Feature flag ready

**Frontend:**
- ✅ Onboarding flow with Plaid connection step
- ✅ Portfolio page with account selection dropdown
- ✅ Live portfolio value tracking
- ✅ Historical portfolio charts
- ✅ Holdings, analytics, asset allocation displays

### Key Discoveries

1. **SnapTrade SDK Already Installed** (`snaptrade-python-sdk==11.0.140`)
2. **Real-time system uses Alpaca market data** (not Plaid)
3. **Portfolio history reconstruction uses FMP for historical prices**
4. **Database migration already run** (migration 008)

### Critical Design Decisions

#### 1. **Data Refresh Strategy**
- SnapTrade data is cached (varies by brokerage)
- Use SnapTrade's `/refresh` endpoint for on-demand updates
- Keep Alpaca market data stream for real-time pricing
- **Hybrid approach**: SnapTrade holdings + Alpaca/FMP prices

#### 2. **WebSocket Integration**
- **Current**: Alpaca market data → Redis → WebSocket
- **New**: SnapTrade holdings + existing price stream
- **Solution**: Fetch SnapTrade positions, subscribe symbols to Alpaca stream

#### 3. **Historical Charts**
- **Current**: Plaid transactions → FMP prices → daily snapshots
- **New**: SnapTrade transactions → FMP prices → daily snapshots
- **Solution**: Port reconstruction logic to use SnapTrade provider

#### 4. **Account Selection**
- **Current**: Plaid accounts in dropdown
- **New**: All accounts (Alpaca + SnapTrade) in dropdown
- **Solution**: Unified account view, filter by account_id

## Implementation Phases

### Phase 1: Core SnapTrade Provider ✅ (DONE)
- Database migration complete
- Documentation created

### Phase 2: Backend Integration (THIS PHASE)
**Files to Create/Modify:**

1. **`backend/utils/portfolio/snaptrade_provider.py`** ✅ (documented)
2. **`backend/routes/snaptrade_routes.py`** (NEW)
   - Connection portal URL generation
   - Webhook handlers
   - Manual refresh endpoints

3. **`backend/utils/portfolio/portfolio_service.py`** (MODIFY)
   - Add SnapTrade to provider list
   - Update mode detection

4. **`backend/services/snaptrade_sync_service.py`** (NEW)
   - Background sync for SnapTrade holdings
   - Integration with existing aggregated_holdings

5. **`backend/portfolio_realtime/portfolio_calculator.py`** (MODIFY)
   - Support SnapTrade account positions
   - Calculate values using Alpaca price stream

### Phase 3: Frontend Connection Flow
**Files to Create/Modify:**

1. **`frontend-app/components/portfolio/SnapTradeConnectButton.tsx`** (NEW)
2. **`frontend-app/app/api/snaptrade/create-connection/route.ts`** (NEW)
3. **`frontend-app/app/onboarding/snaptrade-callback/page.tsx`** (NEW)
4. **`frontend-app/components/onboarding/PlaidConnectionStep.tsx`** (MODIFY)
   - Replace with SnapTrade connection
   - Keep Plaid as fallback (feature flag)

### Phase 4: Portfolio Page Enhancements
**Files to Modify:**

1. **`frontend-app/app/portfolio/page.tsx`**
   - Account dropdown (all sources)
   - Per-account analytics

2. **`backend/utils/portfolio/aggregated_portfolio_service.py`**
   - Aggregate SnapTrade + Alpaca holdings
   - Per-account breakdowns

3. **`frontend-app/components/portfolio/PortfolioHistoryChart.tsx`**
   - Support SnapTrade transaction history

### Phase 5: Live Tracking Integration
**Files to Modify:**

1. **`backend/portfolio_realtime/portfolio_calculator.py`**
   - Add SnapTrade account support
   - Subscribe SnapTrade symbols to price stream

2. **`backend/portfolio_realtime/symbol_collector.py`**
   - Collect symbols from SnapTrade accounts

### Phase 6: Trade Execution
**Files to Modify:**

1. **`backend/clera_agents/trade_execution_agent.py`** ✅ (documented)
2. **Integration with portfolio management agent**

### Phase 7: Dashboard Updates
**Files to Modify:**

1. **`frontend-app/app/dashboard/page.tsx`**
   - Replace Plaid button with SnapTrade

### Phase 8: Testing
**Files to Create:**

1. **`backend/tests/portfolio/test_snaptrade_provider.py`**
2. **`backend/tests/portfolio/test_snaptrade_integration.py`**
3. **`backend/tests/realtime/test_snaptrade_websocket.py`**
4. **`frontend-app/tests/components/SnapTradeConnectButton.test.tsx`**

### Phase 9: Production Validation
- Integration testing
- Performance benchmarking
- Security audit
- Production deployment

## Implementation Order

```
Day 1: Backend Core
├── snaptrade_provider.py (copy from docs)
├── snaptrade_routes.py (create)
├── Update portfolio_service.py
└── Test provider connectivity

Day 2: Sync & Real-time
├── snaptrade_sync_service.py
├── Update portfolio_calculator.py
├── Update symbol_collector.py
└── Test real-time updates

Day 3: Frontend Connection
├── SnapTradeConnectButton.tsx
├── API routes
├── Callback page
└── Update onboarding

Day 4: Portfolio Page
├── Update portfolio page
├── Account dropdown
├── Per-account analytics
└── Historical charts

Day 5: Trade Execution & Dashboard
├── Update trade execution agent
├── Update dashboard
├── Integration testing
└── Production validation
```

## Critical Implementation Notes

### 1. Real-time Pricing Strategy
```python
# SnapTrade holdings + Alpaca market data
snaptrade_positions = await snaptrade_provider.get_positions(user_id, account_id)
for position in snaptrade_positions:
    # Subscribe to Alpaca market data stream
    await market_data_consumer.subscribe_symbol(position.symbol)
    
# Calculate value using live prices
portfolio_value = await calculator.calculate_portfolio_value(account_id)
```

### 2. Historical Data Strategy
```python
# SnapTrade transactions + FMP historical prices
transactions = await snaptrade_provider.get_transactions(user_id, account_id)
# Use existing reconstruction logic
await reconstructor.reconstruct_from_transactions(transactions)
```

### 3. Account Aggregation
```python
# Get all accounts
alpaca_accounts = await alpaca_provider.get_accounts(user_id) if has_alpaca
snaptrade_accounts = await snaptrade_provider.get_accounts(user_id) if has_snaptrade

# Aggregate holdings
all_holdings = []
all_holdings.extend(await aggregate_alpaca_holdings(user_id))
all_holdings.extend(await aggregate_snaptrade_holdings(user_id))
```

## Testing Strategy

### Unit Tests
- Each provider method
- Data transformation logic
- Error handling

### Integration Tests
- End-to-end connection flow
- Real-time updates
- Historical reconstruction
- Trade execution

### Edge Cases
- Disconnected accounts
- API failures
- Rate limiting
- Duplicate prevention
- Partial data scenarios

## Rollout Strategy

### Phase 1: Feature Flag (Week 1)
```python
FEATURE_FLAGS = {
    'ENABLE_SNAPTRADE': False,  # Start disabled
    'SNAPTRADE_CONNECTION_FLOW': False,
    'SNAPTRADE_REALTIME': False,
}
```

### Phase 2: Internal Testing (Week 2)
- Enable for admin users only
- Monitor logs and performance
- Fix issues

### Phase 3: Beta Rollout (Week 3)
- Enable for 10% of users
- A/B testing
- Performance monitoring

### Phase 4: Full Production (Week 4)
- Enable for all users
- Deprecate Plaid (keep as fallback)
- Monitor and optimize

## Success Metrics

### Technical
- ✅ <2s portfolio load time
- ✅ >99% WebSocket uptime
- ✅ <1% error rate
- ✅ Support 10+ connected accounts per user

### Business
- ✅ Trade execution from any brokerage
- ✅ Real-time portfolio tracking
- ✅ Complete historical charts
- ✅ Seamless user experience

## Risk Mitigation

### Risk 1: API Rate Limits
- **Mitigation**: Intelligent caching, batch requests
- **Fallback**: Graceful degradation, cached data

### Risk 2: Real-time Data Gaps
- **Mitigation**: Use Alpaca market data for pricing
- **Fallback**: Polling-based updates

### Risk 3: Historical Data Accuracy
- **Mitigation**: Use SnapTrade transactions + FMP prices
- **Fallback**: Manual price data entry

### Risk 4: User Migration
- **Mitigation**: Gradual rollout with feature flags
- **Fallback**: Keep Plaid as backup provider

## Next Steps

1. ✅ Review this plan
2. → Execute Phase 2 (Backend Integration)
3. → Execute Phase 3 (Frontend Connection)
4. → Continue through phases systematically
5. → Production deployment

---

**Remember**: Every change must be:
- ✅ SOLID principles compliant
- ✅ Fully tested (unit + integration)
- ✅ Production-ready
- ✅ Feature flag controlled
- ✅ Backward compatible (hybrid mode)

Let's build something millions will depend on! 🚀

