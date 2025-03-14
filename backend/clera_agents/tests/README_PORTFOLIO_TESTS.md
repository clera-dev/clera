# Portfolio Management System Tests

## Overview

This directory contains comprehensive unit tests for the portfolio management system. These tests are critically important as they verify the correctness of the system that will be used to manage financial portfolios for potentially millions of users.

The portfolio management system is composed of three main components:

1. **Portfolio Types** - Type definitions for portfolio management (asset classes, security types, risk profiles, etc.)
2. **Portfolio Analysis** - Tools for analyzing portfolios and generating rebalancing instructions
3. **Portfolio Management Agent** - The agent that interacts with external systems and utilizes the portfolio analysis tools

## Test Suite Structure

The test suite is organized into three main test files, each corresponding to one of the main components:

- `test_portfolio_types.py` - Tests for the type definitions in portfolio_types.py
- `test_portfolio_analysis.py` - Tests for the portfolio analysis tools in portfolio_analysis.py
- `test_portfolio_management_agent.py` - Tests for the portfolio management agent in portfolio_management_agent.py

Additionally, there is a test runner that will run all tests:

- `run_tests.py` - Runs all portfolio management tests

## Data Flow

Understanding the data flow through the portfolio management system is crucial for effective testing:

1. **User Query** - A user asks a question about their portfolio
2. **PM Agent Activation** - The Portfolio Management Agent (PM Agent) in graph.py is activated
3. **Data Retrieval** - PM Agent calls `retrieve_portfolio_positions()` to get the user's portfolio data from Alpaca
4. **Portfolio Analysis** - If rebalancing is needed, PM Agent calls `create_rebalance_instructions()` with the portfolio data and a target portfolio type
5. **Response Generation** - The rebalancing instructions are returned to the user via Clera (the supervisor agent)

### Input/Output Formats

- `retrieve_portfolio_positions()`
  - Input: None (uses account ID from environment)
  - Output: List of Alpaca Position objects containing data like symbol, quantity, market value, cost basis, etc.

- `create_rebalance_instructions(positions_data, target_portfolio_type="aggressive")`
  - Input:
    - positions_data: List of Position objects from Alpaca API
    - target_portfolio_type: String, one of "aggressive", "balanced", or "conservative"
  - Output: String containing formatted rebalancing instructions with dollar amounts for trades

- Inside `create_rebalance_instructions`, the workflow is:
  1. Convert Alpaca positions to `PortfolioPosition` objects
  2. Create an appropriate `TargetPortfolio` based on the target type
  3. Generate rebalancing instructions using `PortfolioAnalyzer.generate_rebalance_instructions()`

## Running the Tests

To run all tests, execute:

```bash
python clera_agents/tests/run_tests.py
```

To run tests for a specific component:

```bash
python -m unittest clera_agents/tests/test_portfolio_types.py
python -m unittest clera_agents/tests/test_portfolio_analysis.py
python -m unittest clera_agents/tests/test_portfolio_management_agent.py
```

## Test Coverage

The test suite covers:

1. **Portfolio Types**
   - Asset allocation validation
   - Target portfolio creation and validation
   - ETF and individual stock allocation calculations

2. **Portfolio Analysis**
   - Position classification (ETFs vs individual stocks, equity vs fixed income)
   - Portfolio analysis calculations (total value, asset class percentages, etc.)
   - Rebalancing instruction generation for different target portfolio types

3. **Portfolio Management Agent**
   - Retrieving portfolio positions from Alpaca
   - Creating rebalance instructions with different target portfolio types
   - Getting stock prices
   - Getting user investment strategy
   - Error handling for API failures

## Expected Test Results

When all tests pass, you should see output similar to:

```
======================================================================
PORTFOLIO MANAGEMENT SYSTEM TESTS
======================================================================
test_empty_security_allocations (__main__.TestAssetAllocation) ... ok
test_invalid_percentage (__main__.TestAssetAllocation) ... ok
test_invalid_security_allocations (__main__.TestAssetAllocation) ... ok
test_valid_allocation (__main__.TestAssetAllocation) ... ok
...
```

## Test Data

The tests use mock data that simulates the format of data returned by the Alpaca API. This allows testing without making actual API calls.

The mock portfolio contains:
- Individual stocks (AAPL, MSFT)
- Equity ETFs (SPY)
- Fixed income ETFs (AGG, BND)

## Critical Aspects Verified

These tests verify critical aspects of the portfolio management system:

1. **Data Integrity** - Ensuring position data is correctly processed
2. **Calculation Accuracy** - Verifying portfolio analysis calculations are correct
3. **Allocation Logic** - Confirming that target portfolios are created with the right allocations
4. **Rebalancing Instructions** - Verifying that rebalancing instructions are clear, accurate, and actionable
5. **Error Handling** - Testing how the system handles API failures and invalid inputs

## Extensibility

As the portfolio management system evolves, these tests should be extended to cover:

1. New portfolio types and asset classes
2. More complex rebalancing scenarios
3. Performance testing with larger portfolios
4. Integration testing with the actual Alpaca API

## Conclusion

The portfolio management system is designed to provide clear, actionable advice to users about how to manage their investments. These tests ensure that the system is working correctly and can be relied upon to manage millions of users' investments safely and effectively. 