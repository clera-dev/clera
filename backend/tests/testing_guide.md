# Testing Guide for Clera Portfolio Realtime System

This guide explains how to run the test suite with proper coverage reporting and ensure all tests run successfully.

## Prerequisites

- Python 3.9+ with pip
- Docker (for Redis container)
- Required Python packages:
  - pytest
  - pytest-asyncio
  - pytest-cov
  - redis

## Running the Test Suite

We've created a test runner script that helps set up the environment for complete testing:

```bash
# Install required packages if not already installed
pip install pytest pytest-asyncio pytest-cov redis

# Run the test suite with coverage
./run_tests.py
```

The script will:
1. Check if Redis is running, and attempt to start it using Docker if it's not
2. Check if the WebSocket server is running on multiple ports (8001 or 8000)
3. Run the test suite with coverage reporting
4. Generate an HTML coverage report in the `coverage_report` directory

## Important Nuances and Known Issues

### WebSocket Server Port Detection

**IMPORTANT:** The test suite checks for WebSocket server availability on both ports 8001 and 8000:

- Port 8001: Used when running individual WebSocket server (`python -m portfolio_realtime.websocket_server`)
- Port 8000: Used when running all services together (`python -m portfolio_realtime.run_services`)

If you're encountering skipped tests with the message "WebSocket server not running", ensure one of these is true:

1. You've started the standalone WebSocket server:
   ```bash
   python -m portfolio_realtime.websocket_server
   ```

2. OR you've started the combined services:
   ```bash
   python -m portfolio_realtime.run_services
   ```

The port detection logic in `run_tests.py` and `test_portfolio_realtime_integration.py` has been updated to check both ports 8000 and 8001.

### Hanging Test: test_event_loop_in_market_data_consumer

The `test_event_loop_in_market_data_consumer` test may appear to hang indefinitely. This is because:

1. The test creates an asyncio task that runs the consumer's main loop
2. The task is then cancelled after a short delay
3. In some environments, the task cancellation may not properly propagate

**Workaround Solutions:**

If this test hangs:

1. **Option 1**: Run with a timeout flag:
   ```bash
   pytest tests/test_portfolio_realtime_integration.py::test_event_loop_in_market_data_consumer -v --timeout=5
   ```
   (Requires installing pytest-timeout: `pip install pytest-timeout`)

2. **Option 2**: Skip this test specifically:
   ```bash
   pytest tests/test_portfolio_realtime_integration.py::test_event_loop_in_market_data_consumer -v -k "not test_event_loop_in_market_data_consumer"
   ```

3. **Option 3**: Modify the test to include a timeout:
   ```python
   # In the test file
   @pytest.mark.asyncio
   @pytest.mark.timeout(5)  # Add timeout decorator
   async def test_event_loop_in_market_data_consumer():
       # Test code here...
   ```

### Redis Connection Issues

For Redis connection issues:

1. Ensure Redis is running with `redis-cli ping` (should return "PONG")
2. If not running, start with:
   - macOS: `brew services start redis`
   - Linux: `sudo systemctl start redis-server`
   - Docker: `docker run --name clera-test-redis -p 6379:6379 -d redis:alpine`

### ModuleNotFoundError Issues

If encountering `ModuleNotFoundError` despite installing packages:

1. Ensure you're directly activating the virtual environment:
   ```bash
   source venv/bin/activate  # Not using activate.sh
   ```

2. Verify the module is installed in the active environment:
   ```bash
   pip list | grep <module-name>
   ```

## Running Tests Manually

If you prefer to run tests manually, you can use these commands:

```bash
# Run all tests
pytest

# Run tests with coverage
pytest --cov=portfolio_realtime --cov-report=term --cov-report=html:coverage_report

# Run a specific test file
pytest tests/test_portfolio_realtime_integration.py

# Run a specific test function
pytest tests/test_portfolio_realtime_integration.py::test_symbol_collector_initialization

# Run with timeout for hanging tests
pytest --timeout=10

# Skip specific tests
pytest -k "not test_event_loop_in_market_data_consumer"
```

## Avoiding Skipped Tests

Some tests are skipped if certain services aren't running. To avoid skipped tests:

1. **Redis Server**
   - Start Redis locally: `docker run --name clera-test-redis -p 6379:6379 -d redis:alpine`
   - Or use the test runner script which handles this automatically

2. **WebSocket Server**
   - Start in a separate terminal: `python -m portfolio_realtime.websocket_server`
   - OR use the combined services: `python -m portfolio_realtime.run_services`
   - The test will detect the server on either port 8001 (standalone) or 8000 (combined)

## Interpreting Coverage Reports

After running tests with coverage, open `coverage_report/index.html` in your browser to see:

- Overall coverage percentage
- Coverage by file
- Line-by-line coverage highlighting

Aim for at least 80% coverage for production code.

## Complete Testing Checklist

To ensure 100% test coverage:

1. ✅ Start Redis (handled by `run_tests.py` or manually)
2. ✅ Start WebSocket server or combined services (in another terminal)
3. ✅ Run tests with coverage: `./run_tests.py`
4. ✅ Check coverage report for any gaps
5. ✅ Fix any hanging tests by using timeout or modifying test logic
6. ✅ Address any skipped tests by ensuring prerequisites are met

## CI/CD Integration

For CI/CD pipelines, use:

```yaml
- name: Run tests with coverage
  run: |
    pip install pytest pytest-asyncio pytest-cov pytest-timeout redis
    # Start Redis in CI environment
    docker run --name clera-test-redis -p 6379:6379 -d redis:alpine
    # Start WebSocket server in background
    python -m portfolio_realtime.websocket_server &
    # Wait for WebSocket server to start
    sleep 5
    # Run tests with coverage and timeout
    pytest --cov=portfolio_realtime --cov-report=xml --timeout=10
    # Upload coverage report if needed
    # codecov or similar tool
``` 