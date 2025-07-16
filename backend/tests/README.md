# Clera Backend Tests

This directory contains the test suite for the Clera backend, following proper architectural patterns and separation of concerns.

## Test Architecture

### ✅ Proper Test Configuration

Tests are configured using:
- `pytest.ini` - Main pytest configuration
- `conftest.py` - Shared fixtures and path configuration
- `setup.py` - Package configuration for proper imports

### ❌ Anti-Patterns Avoided

- **No `sys.path.append()` in test files** - This creates tight coupling and violates separation of concerns
- **No direct modification of Python path in individual tests** - Use proper package structure instead
- **No hard dependencies on external services** - All external dependencies are mocked

## Running Tests

### Option 1: Install Package in Editable Mode (Recommended)

```bash
# From the backend directory
pip install -e .

# Run tests
pytest tests/
```

### Option 2: Use pytest Configuration

```bash
# From the backend directory
pytest tests/
```

The `conftest.py` file handles path configuration automatically.

### Option 3: Run Individual Test Files

```bash
# Run specific test file
pytest tests/unit/test_realistic_approach.py

# Run with verbose output
pytest tests/unit/test_realistic_approach.py -v
```

## Test Structure

### Unit Tests (`tests/unit/`)
- Test individual functions and classes in isolation
- Use mocking for all external dependencies
- Focus on business logic validation

### Integration Tests (`tests/integration/`)
- Test interactions between components
- May use real external services in controlled environments
- Validate end-to-end workflows

### Performance Tests (`tests/performance/`)
- Test system performance and scalability
- Measure response times and resource usage

## Best Practices

### 1. Use Dependency Injection
```python
# ✅ Good: Use mocking and dependency injection
with patch('module.ExternalService') as mock_service:
    mock_service.return_value.method.return_value = expected_result
    result = function_under_test()
    assert result == expected_result
```

### 2. Mock External Dependencies
```python
# ✅ Good: Mock all external services
@pytest.fixture
def mock_broker_client():
    mock_client = Mock()
    mock_client.get_account.return_value = mock_account
    return mock_client
```

### 3. Use Proper Test Classes
```python
# ✅ Good: Use unittest.TestCase or pytest classes
class TestPortfolioCalculator(unittest.TestCase):
    def setUp(self):
        self.calculator = PortfolioCalculator()
    
    def test_calculation(self):
        result = self.calculator.calculate()
        self.assertEqual(result, expected_value)
```

### 4. Avoid Direct Path Modification
```python
# ❌ Bad: Don't modify sys.path in test files
import sys
sys.path.append('.')  # This violates separation of concerns

# ✅ Good: Use proper package structure
from portfolio_realtime.portfolio_calculator import PortfolioCalculator
```

## Fixtures

Common fixtures are defined in `conftest.py`:

- `mock_broker_client` - Mocked broker API client
- `mock_redis_client` - Mocked Redis client
- `sample_account_id` - Sample account ID for testing
- `sample_portfolio_data` - Sample portfolio data

## Continuous Integration

Tests are configured to run in CI environments without requiring:
- Real API keys
- External service connections
- Manual path configuration

All tests use mocked dependencies and can run in isolation.

## Troubleshooting

### Import Errors
If you encounter import errors:

1. **Install the package in editable mode:**
   ```bash
   pip install -e .
   ```

2. **Check pytest configuration:**
   ```bash
   pytest --collect-only
   ```

3. **Verify conftest.py is loaded:**
   ```bash
   pytest --setup-show
   ```

### Test Failures
- Ensure all external dependencies are properly mocked
- Check that test data matches expected formats
- Verify that assertions use appropriate tolerances for floating-point comparisons

## Architecture Compliance

This test suite follows the architectural rule:
> "Directly modifying sys.path in test code introduces tight coupling between test and application code, violating separation of concerns and maintainable module boundaries."

By using proper package structure, pytest configuration, and dependency injection, we maintain clean separation between test and application code while ensuring tests are reliable and maintainable. 