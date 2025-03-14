# Clera Agents Test Suite

This directory contains test files for the Clera agents functionality.

## Available Tests

- `standalone_portfolio_test.py`: A fully standalone test for portfolio management functionality
  - Tests portfolio analysis and rebalancing instructions
  - Does not depend on the main application code
  - Can be run directly with `python clera_agents/tests/standalone_portfolio_test.py`

- `test_portfolio.py`: The original portfolio test file (requires importing from main app)
  - May have import dependencies on the main application

- `test_inputs.json`: Sample test inputs for agent tests

## Running Tests

### Standalone Portfolio Test

The recommended way to test portfolio functionality is using the standalone test:

```bash
python clera_agents/tests/standalone_portfolio_test.py
```

This script contains all the necessary types and classes needed for testing without depending on the main application code. 