# Future-Ready Portfolio Architecture

## Overview

The current Plaid integration has been designed with **future hybrid mode capabilities** in mind. This document outlines how the architecture supports future scenarios where users can view and filter between Clera brokerage positions and external account positions.

## Current State (Phase 1)

**Portfolio Mode**: `aggregation` (external accounts only via Plaid)

- Users see aggregated portfolio from all their external investment accounts
- Data pulled from Plaid and displayed using existing portfolio page components
- Feature flags control whether aggregation mode is enabled

## Future Capabilities (Phase 2+)

### 1. **Hybrid Portfolio Mode**

**Portfolio Mode**: `hybrid` (Clera + external accounts combined)

```bash
# Environment variables for hybrid mode
FF_AGGREGATION_MODE=true
FF_BROKERAGE_MODE=true
```

**User Experience**:
- See total portfolio value across all accounts (Clera + external)
- Filter between "Clera Only", "External Only", or "All Sources"  
- Per-account breakdown for fine-grained insights
- Clear visual indicators of data source for each position

### 2. **Source Attribution Architecture**

Each position in the system now includes comprehensive source metadata:

```typescript
interface EnhancedPositionData {
  // Standard PositionData fields...
  symbol: string;
  market_value: string;
  // ... etc
  
  // FUTURE-READY: Source attribution
  data_source: 'external' | 'clera';        // Primary source filter
  institutions: string[];                   // Institution names
  account_breakdown: AccountContribution[]; // Per-account details
  
  // FUTURE-READY: Source-specific metadata
  source_metadata: {
    provider: 'plaid' | 'alpaca';           // Technical provider
    aggregated_across_accounts: boolean;     // Multiple accounts for same position
    can_trade: boolean;                     // Only Clera positions are tradeable
    is_external: boolean;                   // Quick external check
  };
}
```

### 3. **API Architecture for Hybrid Mode**

The `/api/portfolio/aggregated` endpoint supports future hybrid queries:

```typescript
// Current usage (external only)
GET /api/portfolio/aggregated

// Future hybrid mode usage
GET /api/portfolio/aggregated?include_clera=true&source_filter=all
GET /api/portfolio/aggregated?include_clera=true&source_filter=clera
GET /api/portfolio/aggregated?include_clera=true&source_filter=external
```

**Implementation Status**:
- ✅ API signature ready for hybrid mode
- ✅ Source attribution in position data
- ✅ Filtering logic architecture in place
- 🚧 Clera position fetching (requires integration)
- 🚧 Position aggregation across sources (requires business logic)

### 4. **Frontend Filtering Components**

**PortfolioSourceFilter Component** (ready but hidden until hybrid mode):

```tsx
// Automatically shows when hasMultipleSources = true
<PortfolioSourceFilter
  positions={positions}
  activeFilter={'all' | 'external' | 'clera'}
  onFilterChange={(filter) => setSourceFilter(filter)}
  showPerAccountView={showPerAccountView}
  onPerAccountToggle={setShowPerAccountView}
/>
```

**Features**:
- Source filter tabs (All, External, Clera)
- Value and position count per source
- Institution breakdown for external accounts
- Per-account view toggle for fine-grained insights
- Automatic hiding when only one source is available

## Implementation Roadmap for Hybrid Mode

### Phase 2A: Clera Position Integration

1. **Extend `/api/portfolio/aggregated` endpoint**:
   ```python
   # Add Clera position fetching
   if include_clera and portfolio_mode in ['brokerage', 'hybrid']:
       clera_positions = await get_clera_positions(user_id)
   ```

2. **Create `get_clera_positions()` function**:
   - Fetch positions from existing Alpaca integration
   - Transform to aggregated position format
   - Add `data_source: 'clera'` attribution

3. **Position Aggregation Logic**:
   - Combine positions with same symbol across sources
   - Preserve per-account breakdown
   - Handle edge cases (same symbol in Clera + external)

### Phase 2B: Frontend Filtering Logic

1. **Enable Source Filtering**:
   ```typescript
   // Update position fetching to use source filter
   const fetchPortfolioData = async (sourceFilter = 'all') => {
     const response = await fetch(
       `/api/portfolio/aggregated?source_filter=${sourceFilter}`
     );
   };
   ```

2. **Portfolio Page Updates**:
   - Show PortfolioSourceFilter when `hasMultipleSources = true`
   - Update all portfolio components to handle filtered positions
   - Add source indicators to position displays

3. **Enhanced Trade Actions**:
   - Only show trade buttons for Clera positions (`can_trade: true`)
   - Disable trade actions for external positions
   - Clear visual distinction between tradeable and view-only positions

### Phase 2C: Advanced Features

1. **Performance Comparison**:
   - Compare Clera portfolio performance vs external accounts
   - Benchmark against market indices per source
   - ROI analysis across different account types

2. **Smart Insights**:
   - Asset allocation recommendations across all accounts
   - Rebalancing suggestions considering all holdings
   - Tax optimization across accounts (future advanced feature)

## Database Schema Support

The current schema already supports hybrid mode:

```sql
-- user_investment_accounts supports both Plaid and future Alpaca references
provider IN ('plaid', 'alpaca')

-- user_aggregated_holdings includes source attribution
data_source TEXT -- 'plaid' for external, 'alpaca' for Clera

-- user_portfolio_snapshots supports provider breakdown
provider_breakdown JSONB -- {"plaid": {...}, "alpaca": {...}}
```

## Feature Flag Strategy

```bash
# Phase 1: External only (current)
FF_AGGREGATION_MODE=true
FF_BROKERAGE_MODE=false

# Phase 2: Hybrid mode (future)
FF_AGGREGATION_MODE=true  
FF_BROKERAGE_MODE=true

# Phase 3: Advanced features (future)
FF_MULTI_ACCOUNT_ANALYTICS=true
FF_PORTFOLIO_INSIGHTS=true
```

## Migration Strategy

**Zero Downtime Migration**:
1. Deploy hybrid-ready code with feature flags disabled
2. Test hybrid mode with select users (`FF_BROKERAGE_MODE=true` for test users)
3. Gradually rollout hybrid mode based on user onboarding status
4. Full hybrid mode when ready (`FF_BROKERAGE_MODE=true` globally)

**User Experience**:
- Existing users: No change until they connect external accounts
- New users: Start with aggregation mode, upgrade to hybrid when they open Clera accounts
- Power users: Full hybrid mode with advanced filtering and insights

## Benefits of Future-Ready Architecture

1. **Seamless Upgrade Path**: From aggregation → hybrid mode without code rewrites
2. **User Choice**: Users control their portfolio view (all accounts vs specific sources)
3. **Enhanced Insights**: Per-account breakdown for better financial understanding
4. **Trading Integration**: Clear distinction between viewable vs tradeable positions
5. **Scalable Design**: Ready for additional providers (Robinhood, Fidelity, etc.)

This architecture ensures that when you're ready to implement hybrid mode, the foundation is already built and tested. Users will have a smooth transition from external-only portfolio views to comprehensive multi-source portfolio management.
