# Backend Test Directory Structure

This directory contains all automated tests for the backend codebase, organized by test type and subject area for clarity and maintainability.

## Directory Overview

- **account_closure/**  
  Tests related to account closure workflows, compliance, and API endpoints.

- **agents/**  
  Tests for AI agents, agent coverage, and agent-related logic.

- **integration/**  
  Integration tests, comprehensive validation, and end-to-end scenarios that span multiple modules or systems.

- **market_data/**  
  Tests for market data ingestion, symbol collection, and related utilities.

- **performance/**  
  Performance and load tests, including those that measure speed, resource usage, or stress scenarios.

- **portfolio/**  
  Tests for portfolio calculations, returns, risk scores, rebalancing, and related analytics.

- **purchase_history/**  
  Tests for purchase history logic, edge cases, and comprehensive scenarios.

- **unit/**  
  Small, isolated unit tests for individual functions or classes. Use this for logic that does not require integration with other modules.

- **utils/**  
  Utility and helper test scripts, coverage reports, and miscellaneous test tools.

- **websocket/**  
  Tests for WebSocket and real-time data handling, including server and client connection logic.

## Root-Level Files

- `run_tests.py` — Script to run all or specific test suites.
- `final_test_summary.py`, `final_validation_demo.py` — Test orchestration, reporting, or demo scripts.
- `__init__.py` — Marks this directory as a Python package.

## Conventions & Best Practices

- Place new tests in the most specific subdirectory that matches their subject area.
- For new categories, create a new directory and update this README.
- Use descriptive filenames (e.g., `test_portfolio_calculator.py`, `test_account_closure_api_endpoints.py`).
- Prefer integration tests for workflows spanning multiple modules; use unit tests for isolated logic.
- Keep test data and fixtures close to the tests that use them, or in a dedicated `fixtures/` directory if shared.

## Example

- To add a test for a new portfolio risk calculation:
  - Place it in `portfolio/` as `test_new_risk_calculation.py`.
- To add a test for a new WebSocket event:
  - Place it in `websocket/` as `test_new_event.py`.

---

For questions or to propose changes to this structure, please contact the backend maintainers. 