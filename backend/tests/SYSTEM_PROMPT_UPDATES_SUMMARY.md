# System Prompt Updates for Performance Analysis Integration

## Overview

This document summarizes the system prompt updates made to ensure that both Clera (the supervisor) and the portfolio_management_agent understand and can effectively use the new performance analysis capabilities.

## Date Updated
January 6, 2025

## Changes Made

### 1. Enhanced Portfolio Summary P/L Display

**File**: `backend/clera_agents/tools/portfolio_analysis.py`

**Enhancement**: Made P/L information much more descriptive since it doesn't go directly to users.

**Before**:
```
## Individual Positions
  AAPL: $45,000.00 (📈 +5,000.00, +12.50%)
```

**After**:
```
## Individual Positions
*P/L shown below represents unrealized gains/losses since purchase (total position performance)*
  AAPL: $45,000.00 (📈 gain of $5,000.00, +12.50% since purchase)
```

**Benefits**:
- Clear explanation that P/L is "since purchase" (not YTD or other timeframe)
- More descriptive language ("gain of"/"loss of" instead of just +/-)
- Explanatory note at the top of the section
- Eliminates confusion about what time period the P/L represents

### 2. Clera Supervisor Prompt Updates

**File**: `backend/clera_agents/graph.py`

**Changes Made**:

#### A. Updated Tools Description
**Before**:
```
- transfer_to_portfolio_management_agent - Use for: portfolio analysis, holdings data, allocation details, rebalancing
```

**After**:
```
- transfer_to_portfolio_management_agent - Use for: portfolio analysis, holdings data, allocation details, rebalancing, performance tracking, and Year-to-Date (YTD) returns. This agent now provides enhanced portfolio summaries with individual position P/L data and can analyze investment performance over custom time periods.
```

#### B. Updated Routing Decision Guidelines
**Before**:
```
portfolio_management_agent`: Portfolio status, holdings, performance, allocation, analysis/rebalancing. **Prioritize this if ambiguous.**
```

**After**:
```
portfolio_management_agent`: Portfolio status, holdings, performance, allocation, analysis/rebalancing. **Also use for investment performance analysis over time periods (YTD returns, historical performance, etc.)**. **Prioritize this if ambiguous.**
```

**Benefits**:
- Clera now knows the portfolio agent can handle performance analysis
- Clear guidance on when to route YTD and historical performance queries
- Understanding of enhanced P/L capabilities in portfolio summaries

### 3. Portfolio Management Agent Prompt Updates

**File**: `backend/clera_agents/graph.py`

**Major Enhancement**: Completely rewrote the prompt to include the new `calculate_investment_performance` tool.

#### A. Added Tool Descriptions Section
```
YOUR TOOLS:
1. get_portfolio_summary() - Provides comprehensive portfolio analysis including:
   - Total portfolio value and cash balance
   - Individual position details with unrealized P/L since purchase
   - Asset allocation breakdown
   - Risk and diversification scores
   
2. rebalance_instructions() - Generates specific rebalancing recommendations

3. calculate_investment_performance() - NEW TOOL for analyzing investment performance:
   - Takes symbol, start_date, end_date (optional), compare_to_sp500 (optional)
   - Provides detailed performance analysis with annualized returns
   - Includes optional S&P 500 benchmark comparison
   - Perfect for Year-to-Date (YTD) analysis or custom time periods
```

#### B. Added Tool Selection Guidelines
```
USE calculate_investment_performance() for:
* Year-to-Date (YTD) performance requests ("How did AAPL do this year?")
* Performance analysis over specific time periods ("MSFT performance since June")
* Stock performance comparisons vs market ("How did TSLA perform vs S&P 500?")
* Historical return analysis ("What was my Amazon return over 2 years?")
```

#### C. Added Practical Examples
```
Query: "How did Apple do this year?"
Action: calculate_investment_performance(symbol="AAPL", start_date="2024-01-01")

Query: "What's my Tesla performance since I bought it in March?"
Action: calculate_investment_performance(symbol="TSLA", start_date="2024-03-01")
```

**Benefits**:
- Agent now understands when to use the new performance tool vs portfolio summary
- Clear examples of common user queries and how to handle them
- Awareness of enhanced P/L display in portfolio summaries

### 4. Tool List Updates

**File**: `backend/clera_agents/graph.py`

**Added**: `pm_module.calculate_investment_performance` to the `portfolio_management_tools` list.

```python
portfolio_management_tools = [
    pm_module.get_portfolio_summary,
    pm_module.rebalance_instructions,
    pm_module.calculate_investment_performance  # NEW
]
```

## Key Improvements Achieved

### 1. Clarity of P/L Time Periods
- **Problem**: Users couldn't tell if P/L was YTD, since purchase, or some other timeframe
- **Solution**: Clear explanatory text stating "unrealized gains/losses since purchase"
- **Impact**: Eliminates confusion and provides context for the P/L numbers

### 2. Enhanced Agent Intelligence
- **Problem**: Agents didn't know about new performance analysis capabilities
- **Solution**: Updated prompts with tool descriptions, selection guidelines, and examples
- **Impact**: Agents can now intelligently route performance analysis queries

### 3. Better User Experience
- **Problem**: Users asking for YTD returns wouldn't get the right tool
- **Solution**: Clear routing guidelines for performance-related queries
- **Impact**: Performance analysis requests now go to the right tool automatically

## Real-World Query Handling Examples

### Before Updates
**User**: "How did Apple do this year?"
**Old Behavior**: Might route to financial_analyst_agent for general news
**Result**: General market news, not specific performance analysis

### After Updates
**User**: "How did Apple do this year?"
**New Behavior**: Routes to portfolio_management_agent → calculate_investment_performance
**Result**: Detailed YTD performance analysis with annualized returns and S&P 500 comparison

### Before Updates
**User**: "What's in my portfolio?"
**Old Behavior**: Basic portfolio summary with confusing P/L display
**Result**: "AAPL: $45,000.00 (📈 +5,000.00, +12.50%)" - unclear timeframe

### After Updates
**User**: "What's in my portfolio?"
**New Behavior**: Enhanced portfolio summary with clear P/L explanation
**Result**: "AAPL: $45,000.00 (📈 gain of $5,000.00, +12.50% since purchase)" - clear timeframe

## Quality Assurance

### Testing Completed
- ✅ Graph imports successfully with new tool configuration
- ✅ All existing functionality still works (validated via demo script)
- ✅ Portfolio summary formatting enhanced and working
- ✅ System prompts validated for consistency and clarity

### Production Readiness
- ✅ All changes are backward compatible
- ✅ No breaking changes to existing functionality
- ✅ Enhanced user experience with clearer information
- ✅ Intelligent routing of performance analysis queries

## Conclusion

These system prompt updates ensure that:

1. **Clera** (supervisor) understands when to route performance analysis queries to the portfolio management agent
2. **Portfolio Management Agent** knows how to use the new `calculate_investment_performance` tool appropriately  
3. **Users** get clear, unambiguous information about P/L timeframes in portfolio summaries
4. **Performance Analysis** queries are handled intelligently and routed to the correct tool

The implementation is now fully integrated into the agent system and ready for production deployment. 