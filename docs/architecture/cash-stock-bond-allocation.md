# Cash/Stock/Bond Asset Allocation Feature

## Overview

The Cash/Stock/Bond Asset Allocation feature provides users with a more accurate and meaningful breakdown of their portfolio allocation compared to the basic "asset class" grouping from Alpaca. Instead of showing "US Equity 100%", users now see their actual allocation split between cash, stocks, and bonds.

## Key Features

- **Accurate Bond Detection**: Identifies bond ETFs as bonds rather than equities
- **Real-time Updates**: Fetches live data from Alpaca API and Redis cache
- **Comprehensive Coverage**: Handles cash, individual stocks, stock ETFs, bond ETFs, crypto, and options
- **Fallback Mechanism**: Falls back to original asset class grouping if new endpoint fails
- **Visual Enhancement**: Displays pie chart with distinct colors for each category

## Architecture

### Backend Components

#### 1. Asset Classification System (`utils/asset_classification.py`)

**Core Functions:**
- `classify_asset()`: Classifies individual assets as cash, stock, or bond
- `calculate_allocation()`: Aggregates positions and calculates percentages
- `get_allocation_pie_data()`: Formats data for frontend pie chart

**Bond Detection Methods:**
1. **Symbol-based**: Comprehensive list of 50+ major bond ETFs
2. **Name-based**: Keyword detection in asset names (e.g., "Bond", "Treasury", "Municipal")
3. **Fallback**: Unknown assets default to stock classification

**Asset Categories:**
- **Cash**: Account cash balance and cash equivalents
- **Stock**: Individual stocks, stock ETFs, crypto assets, options
- **Bond**: Bond ETFs, treasury funds, municipal bonds, corporate bond funds

#### 2. API Endpoint (`/api/portfolio/cash-stock-bond-allocation`)

**Request:**
```
GET /api/portfolio/cash-stock-bond-allocation?account_id={accountId}
```

**Response:**
```json
{
  "cash": {"value": 2000.0, "percentage": 20.0},
  "stock": {"value": 6000.0, "percentage": 60.0},
  "bond": {"value": 2000.0, "percentage": 20.0},
  "total_value": 10000.0,
  "pie_data": [
    {
      "name": "Stock (60.0%)",
      "value": 60.0,
      "rawValue": 6000.0,
      "color": "hsl(210, 70%, 55%)",
      "category": "stock"
    },
    // ... more categories
  ]
}
```

### Frontend Components

#### 1. Enhanced AssetAllocationPie Component

**Key Features:**
- Fetches data from new endpoint when viewing asset class allocation
- Displays loading states during data fetch
- Falls back to original logic if new endpoint fails
- Uses distinct colors for each allocation category

**Color Scheme (Clera Brand Colors):**
- **Cash**: Sky Blue (`#87CEEB`) - Light, from top of Clera gradient
- **Stock**: Medium Blue (`#4A90E2`) - Vibrant, from middle of Clera gradient
- **Bond**: Deep Blue (`#2E5BBA`) - Rich, from bottom of Clera gradient

#### 2. API Route (`/api/portfolio/cash-stock-bond-allocation/route.ts`)

Proxies backend requests with authentication and error handling.

## Bond ETF Coverage

The system recognizes 50+ major bond ETFs including:

### Core Bond ETFs
- AGG (iShares Core U.S. Aggregate Bond ETF)
- BND (Vanguard Total Bond Market ETF)
- SCHZ (Schwab Intermediate-Term Treasury ETF)

### Treasury & Government Bonds
- IEF, TLT, SHY (iShares Treasury ETFs)
- GOVT (iShares U.S. Treasury Bond ETF)
- VTEB (Vanguard Tax-Exempt Bond ETF)

### Corporate & High-Yield Bonds
- LQD (iShares Investment Grade Corporate Bond ETF)
- HYG, JNK (High-yield corporate bond ETFs)
- VCIT, VCSH (Vanguard corporate bond ETFs)

### Specialized Bond ETFs
- TIP, VTIP (Inflation-protected securities)
- MUB, VTEB (Municipal bonds)
- EMB, PCY (Emerging market bonds)

## Error Handling

### Backend Error Handling
- **Redis Connection Errors**: Continue with empty positions, fetch from Alpaca
- **Alpaca API Errors**: Log errors, continue with available data
- **Invalid Position Data**: Skip invalid entries, process valid ones
- **Missing Cash Balance**: Default to $0 cash
- **Asset Name Lookup Failures**: Continue without enhanced classification

### Frontend Error Handling
- **API Endpoint Failures**: Fall back to original asset class logic
- **Network Errors**: Display error message with fallback data
- **Loading States**: Show skeleton loaders during data fetch
- **Empty Data**: Display appropriate "no data" messages

## Performance Considerations

### Backend Optimizations
- **Redis Caching**: Positions cached in Redis for fast access
- **Asset Cache**: Asset details cached locally to reduce API calls
- **Batch Processing**: Process all positions in single allocation calculation
- **Decimal Precision**: Use `Decimal` type for accurate financial calculations

### Frontend Optimizations
- **Conditional Fetching**: Only fetch new data when needed (asset class view)
- **Loading States**: Immediate feedback during data fetch
- **Fallback Mechanism**: Quick fallback to cached position data
- **Debounced Refresh**: Prevent excessive API calls on rapid updates

## Testing

### Backend Tests (`tests/test_asset_classification.py`)
- 21 comprehensive test cases covering all scenarios
- Edge cases: empty portfolios, invalid data, crypto assets
- Bond detection: symbol-based and name-based classification
- Allocation calculation: mixed portfolios, zero values, negative cash

### Integration Tests (`tests/test_api_cash_stock_bond_endpoint.py`)
- 9 API endpoint test cases with mocked dependencies
- Error handling: Redis failures, Alpaca API errors
- Data validation: response structure, percentage calculations
- Security: authentication, input validation

### Frontend Tests (`tests/components/AssetAllocationPie.test.tsx`)
- Component rendering with various data states
- API integration: loading states, error handling, fallback logic
- User interactions: tab switching, refresh behavior
- Data processing: pie chart data formatting, color assignments

## Security Considerations

- **Authentication**: All API requests require user authentication
- **Input Validation**: Account ID validation on backend
- **Error Sanitization**: No sensitive data exposed in error messages
- **Rate Limiting**: Inherits existing API rate limiting
- **Data Privacy**: No additional PII collected or stored

## Migration Strategy

### Backward Compatibility
- Original asset class logic remains intact as fallback
- No changes to existing data structures
- Frontend gracefully handles both old and new data formats

### Deployment
- Backend changes deployed first (new endpoint)
- Frontend changes deployed second (consume new endpoint)
- Rollback strategy: disable new endpoint, frontend falls back automatically

## Future Enhancements

### Potential Improvements
1. **Real Estate**: Add REIT classification as separate category
2. **Commodities**: Classify commodity ETFs separately
3. **International**: Separate domestic vs. international stocks/bonds
4. **Sector Bonds**: Classify bonds by sector (government, corporate, municipal)
5. **Duration Analysis**: Add bond duration-based sub-classifications

### Monitoring
- Track API endpoint performance and error rates
- Monitor fallback usage to identify classification gaps
- Log classification accuracy for continuous improvement

## Code Maintainability

### Modularity
- Separate utility module for classification logic
- Clear separation between data fetching and calculation
- Reusable functions for different contexts

### Documentation
- Comprehensive inline comments
- Type annotations for all functions
- Clear variable and function naming

### Testing
- High test coverage (>95%) for all new code
- Integration tests for end-to-end functionality
- Performance tests for large portfolios

---

*Last updated: July 2025*
*Version: 1.0.0* 