# Account-Level Filtering ("X-Ray Vision") Architecture

## Overview
Allows users to view portfolio analytics for:
- **Total Portfolio**: All accounts combined (401k + IRA + Brokerage)
- **Individual Account**: Just 401k, or just IRA, or just Brokerage
- **Future Hybrid**: Seamlessly combine Plaid external + Clera brokerage

## Data Flow

```
User selects account from dropdown
  ↓
selectedAccountFilter state changes ('total' | 'plaid_xxxxx' | 'alpaca_xxxxx')
  ↓
useEffect triggers (line 652-688)
  ↓
All API calls include filter_account parameter
  ↓
Backend filters data to specific account
  ↓
All components update simultaneously:
  - Portfolio chart
  - Today's change
  - Risk & diversification
  - Asset allocation
  - Holdings table
```

## Backend Support

### Endpoints Supporting filter_account:

1. **Portfolio History** ✅ (line 1791)
   - `/api/portfolio/{account_id}/history?filter_account=plaid_xxxxx`
   - Scales total history by account percentage
   - Returns account-specific timeline

2. **Portfolio Positions** (NEEDS IMPLEMENTATION)
   - Should filter to holdings in specific account only
   - Use `account_contributions` field to identify

3. **Portfolio Analytics** (NEEDS IMPLEMENTATION)
   - Calculate risk/diversification for specific account
   - Use filtered holdings

4. **Asset Allocation** (NEEDS IMPLEMENTATION)
   - Calculate allocation for specific account only
   - Filter holdings first, then calculate

## Frontend Requirements

### Components That Need Updating:

1. **LivePortfolioValuePlaid** ✅ (DONE)
   - Dropdown already implemented
   - Triggers `onAccountFilterChange`
   - Shows account-specific value

2. **PortfolioHistoryChart**
   - Receives filtered history data
   - Updates when data changes
   - Already working via data prop

3. **RiskDiversificationScores**
   - Needs to re-fetch when filter changes
   - Pass filter to analytics API

4. **AssetAllocationPie**
   - Needs to re-fetch when filter changes
   - Pass filter to allocation APIs

5. **HoldingsTable**
   - Filter positions client-side OR
   - Re-fetch with filter parameter

## Implementation Strategy

### Phase 1: Backend - Positions Filtering
```python
# In aggregated_portfolio_service.py
async def get_filtered_positions(self, user_id: str, filter_account: Optional[str]) -> List[Dict]:
    holdings = await self._get_aggregated_holdings(user_id)
    
    if not filter_account or filter_account == 'total':
        return holdings  # Return all
    
    # Filter to specific account
    filtered = []
    for holding in holdings:
        contributions = holding['account_contributions']
        for contrib in contributions:
            if contrib['account_id'] == filter_account:
                # Create holding for just this account
                filtered_holding = {
                    ...holding,
                    'total_market_value': contrib['market_value'],
                    'total_quantity': contrib['quantity'],
                    # Recalculate other fields
                }
                filtered.append(filtered_holding)
                break
    
    return filtered
```

### Phase 2: Backend - Analytics Filtering
```python
# In aggregated_portfolio_service.py
async def get_portfolio_analytics(self, user_id: str, filter_account: Optional[str] = None):
    # Get filtered holdings
    holdings = await self.get_filtered_positions(user_id, filter_account)
    
    # Calculate analytics on filtered data
    return calculate_portfolio_analytics(holdings, user_id)
```

### Phase 3: Backend - Allocation Filtering
```python
# Similar pattern for get_asset_allocation
async def get_asset_allocation(self, user_id: str, filter_account: Optional[str] = None):
    holdings = await self.get_filtered_positions(user_id, filter_account)
    return calculate_asset_allocation(holdings, user_id)
```

### Phase 4: Frontend - Wire Up Filtering

1. **Add filter_account to all API calls**:
```typescript
const buildFilteredUrl = (baseUrl: string): string => {
  if (selectedAccountFilter !== 'total') {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}filter_account=${selectedAccountFilter}`;
  }
  return baseUrl;
};
```

2. **Trigger refresh when filter changes**:
```typescript
useEffect(() => {
  if (selectedAccountFilter) {
    // Force refresh of all data
    setIsLoading(true);
    loadInitialStaticData(); // Re-runs all API calls with filter
  }
}, [selectedAccountFilter]);
```

## Testing Strategy

### Test Cases:

1. **Total Portfolio View**
   - Shows combined data from all accounts
   - Risk/div reflects overall portfolio
   - Allocation shows all holdings

2. **Individual Account View (401k)**
   - Shows only 401k data
   - Risk/div for just 401k holdings
   - Allocation for just 401k
   - Holdings filtered to 401k

3. **Individual Account View (IRA)**
   - Same as above but for IRA

4. **Switching Between Accounts**
   - All components update simultaneously
   - No stale data
   - Smooth transitions

5. **Hybrid Mode (Future)**
   - Can view Alpaca account
   - Can view Plaid accounts
   - Can view total (combined)

## Performance Optimization

### Efficient Filtering:
- ✅ Backend filters before sending (less data transfer)
- ✅ Frontend caches filtered results
- ✅ Only re-fetch when filter actually changes
- ✅ Debounce rapid filter changes

### Minimal Re-renders:
- ✅ Use React.memo for expensive components
- ✅ Proper dependency arrays in useEffect
- ✅ Batch state updates

## Security

### Access Control:
- ✅ Verify user owns the account being filtered
- ✅ Prevent cross-user account access
- ✅ Validate account_id format (plaid_xxx or alpaca UUID)

## Future Enhancements

1. **Account Comparison View**
   - Side-by-side comparison of accounts
   - Identify which account is riskier
   - Rebalancing suggestions

2. **Account-Level Goals**
   - Set goals per account
   - Track progress individually
   - Optimize per account type (401k vs IRA strategies)

3. **Tax-Aware Analytics**
   - Different analytics for taxable vs tax-advantaged
   - Tax-loss harvesting suggestions
   - Account-specific tax reporting

