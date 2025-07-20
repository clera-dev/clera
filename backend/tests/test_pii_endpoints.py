"""
Tests for PII (Personally Identifiable Information) management endpoints.
"""

import pytest
import uuid
import os
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import HTTPException

# Import the main app
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api_server import app

client = TestClient(app)

class TestPIIEndpoints:
    
    @pytest.fixture
    def mock_broker_client(self):
        """Mock broker client for testing."""
        with patch('api_server.broker_client') as mock_client:
            # Create a mock account that properly handles getattr calls
            mock_account = Mock()
            # Set up the attributes that the API will access via getattr
            mock_account.email = "test@example.com"
            mock_account.phone = "+1234567890"
            mock_account.street_address = ["123 Main St"]
            mock_account.city = "New York"
            mock_account.state = "NY"
            mock_account.postal_code = "10001"
            mock_account.country = "USA"
            mock_account.date_of_birth = "1990-01-01"
            mock_account.given_name = "John"
            mock_account.family_name = "Doe"
            mock_account.status = "ACTIVE"
            
            # Set up additional attributes that might be accessed
            mock_account.middle_name = None
            mock_account.tax_id = None
            mock_account.tax_id_type = None
            mock_account.country_of_citizenship = None
            mock_account.country_of_birth = None
            mock_account.country_of_tax_residence = None
            mock_account.funding_source = []
            mock_account.is_control_person = None
            mock_account.is_affiliated_exchange_or_finra = None
            mock_account.is_politically_exposed = None
            mock_account.immediate_family_exposed = None
            mock_account.account_number = None
            mock_account.created_at = None
            
            mock_client.get_account_by_id.return_value = mock_account
            mock_client.update_account.return_value = mock_account
            yield mock_client

    @pytest.fixture
    def api_key_setup(self):
        """Set up API key environment for testing."""
        test_api_key = "test-api-key-12345"
        with patch.dict(os.environ, {'BACKEND_API_KEY': test_api_key}):
            yield test_api_key

    @pytest.fixture
    def sample_account_id(self):
        """Sample account ID for testing."""
        return str(uuid.uuid4())

    def test_get_account_pii_success(self, mock_broker_client, api_key_setup, sample_account_id):
        """Test successful PII retrieval."""
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "success" in data
        assert data["success"] is True
        assert "data" in data
        
        pii_data = data["data"]
        assert "identity" in pii_data
        assert "contact" in pii_data
        
        # Check identity fields
        assert pii_data["identity"]["given_name"] == "John"
        assert pii_data["identity"]["family_name"] == "Doe"
        assert pii_data["identity"]["date_of_birth"] == "1990-01-01"
        
        # Check contact fields
        assert pii_data["contact"]["email"] == "test@example.com"
        assert pii_data["contact"]["phone"] == "+1234567890"
        assert pii_data["contact"]["street_address"] == ["123 Main St"]
        assert pii_data["contact"]["city"] == "New York"
        assert pii_data["contact"]["state"] == "NY"
        assert pii_data["contact"]["postal_code"] == "10001"
        assert pii_data["contact"]["country"] == "USA"
        
        # Verify the broker client was called correctly
        mock_broker_client.get_account_by_id.assert_called_once_with(sample_account_id)

    def test_get_account_pii_unauthorized(self, sample_account_id):
        """Test PII retrieval without API key."""
        response = client.get(f"/api/account/{sample_account_id}/pii")
        
        assert response.status_code == 401

    def test_get_account_pii_broker_client_not_initialized(self, api_key_setup, sample_account_id):
        """Test PII retrieval when broker client is not initialized."""
        with patch('api_server.broker_client', None):
            response = client.get(
                f"/api/account/{sample_account_id}/pii",
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 500
            assert "Broker client not available" in response.json()["detail"]

    def test_get_account_pii_alpaca_error(self, mock_broker_client, api_key_setup, sample_account_id):
        """Test PII retrieval when Alpaca API returns an error."""
        mock_broker_client.get_account_by_id.side_effect = Exception("Alpaca API error")
        
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 500

    def test_update_account_pii_success(self, mock_broker_client, api_key_setup, sample_account_id):
        """Test successful PII update."""
        update_data = {
            "contact": {
                "phone": "+1987654321",
                "street_address": ["456 Oak Ave"],
                "city": "Los Angeles",
                "postal_code": "90210"
            }
        }
        
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "updated_fields" in data
        
        # Verify the broker client was called
        mock_broker_client.update_account.assert_called_once()

    def test_update_account_pii_with_update_request(self, mock_broker_client, api_key_setup, sample_account_id):
        """Test PII update with proper UpdateAccountRequest construction."""
        update_data = {
            "contact": {
                "phone": "+1987654321"
            }
        }
        
        # Mock the UpdateAccountRequest import since it's imported inside the function
        with patch('alpaca.broker.requests.UpdateAccountRequest') as mock_update_request_class:
            mock_update_request = Mock()
            mock_update_request_class.return_value = mock_update_request
            
            response = client.patch(
                f"/api/account/{sample_account_id}/pii",
                json=update_data,
                headers={"x-api-key": api_key_setup}
            )
        
        assert response.status_code == 200

    def test_update_account_pii_no_updateable_fields(self, mock_broker_client, api_key_setup, sample_account_id):
        """Test PII update when no updateable fields are provided."""
        # Send an empty contact object - no fields should be updated
        update_data = {
            "contact": {}
        }
        
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should indicate no fields were updated
        assert len(data.get("updated_fields", [])) == 0

    def test_update_account_pii_alpaca_restriction_error(self, api_key_setup, sample_account_id):
        """Test PII update when Alpaca restricts certain fields."""
        with patch('api_server.broker_client') as mock_client:
            # Mock Alpaca returning an error for restricted field updates
            # Use error message that matches the API's pattern matching
            mock_client.update_account.side_effect = Exception("Field cannot be modified after account creation")
            
            update_data = {
                "contact": {
                    "phone": "+1987654321"
                }
            }
            
            response = client.patch(
                f"/api/account/{sample_account_id}/pii",
                json=update_data,
                headers={"x-api-key": api_key_setup}
            )
            
            # Should return success=False with error details
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert "error" in data

    def test_update_account_pii_general_alpaca_error(self, mock_broker_client, api_key_setup, sample_account_id):
        """Test PII update when Alpaca API returns a general error."""
        mock_broker_client.update_account.side_effect = Exception("General API error")
        
        update_data = {
            "contact": {
                "phone": "+1987654321"
            }
        }
        
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 500

    def test_get_updateable_pii_fields_success(self, api_key_setup, sample_account_id):
        """Test successful retrieval of updateable PII fields."""
        response = client.get(
            f"/api/account/{sample_account_id}/pii/updateable-fields",
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "success" in data
        assert data["success"] is True
        assert "data" in data
        
        # Check that the data contains the expected structure
        fields_data = data["data"]
        assert "contact" in fields_data
        assert "identity" in fields_data
        assert "disclosures" in fields_data
        
        # Should contain commonly updateable fields
        contact_fields = fields_data["contact"]
        assert "phone" in contact_fields
        assert "street_address" in contact_fields
        assert "city" in contact_fields
        assert "postal_code" in contact_fields

    def test_get_updateable_pii_fields_with_descriptions(self, api_key_setup, sample_account_id):
        """Test updateable fields endpoint includes field descriptions."""
        response = client.get(
            f"/api/account/{sample_account_id}/pii/updateable-fields",
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "success" in data
        assert data["success"] is True
        assert "data" in data
        
        # Check that fields have descriptions
        fields_data = data["data"]
        contact_fields = fields_data["contact"]
        
        # Should have descriptions for key fields
        assert "phone" in contact_fields
        assert "description" in contact_fields["phone"]
        assert "street_address" in contact_fields
        assert "description" in contact_fields["street_address"]

    def test_update_account_pii_empty_request(self, mock_broker_client, api_key_setup, sample_account_id):
        """Test PII update with empty request body."""
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json={},
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data.get("updated_fields", [])) == 0

    def test_update_account_pii_invalid_json(self, api_key_setup, sample_account_id):
        """Test PII update with invalid JSON."""
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            data="invalid json",
            headers={"x-api-key": api_key_setup, "Content-Type": "application/json"}
        )
        
        assert response.status_code == 500  # The API returns 500 when JSON parsing fails

    def test_pii_endpoints_handle_missing_account_attributes(self, api_key_setup, sample_account_id):
        """Test PII endpoints handle accounts with missing attributes gracefully."""
        with patch('api_server.broker_client') as mock_client:
            # Mock account with missing attributes
            mock_account = Mock()
            mock_account.email = None
            mock_account.phone = None
            mock_account.given_name = "John"
            mock_account.family_name = "Doe"
            # Set up all attributes that the API might access
            for attr in ['street_address', 'city', 'state', 'postal_code', 'country', 'date_of_birth',
                        'middle_name', 'tax_id', 'tax_id_type', 'country_of_citizenship', 'country_of_birth',
                        'country_of_tax_residence', 'funding_source', 'is_control_person', 
                        'is_affiliated_exchange_or_finra', 'is_politically_exposed', 'immediate_family_exposed',
                        'account_number', 'created_at', 'status']:
                setattr(mock_account, attr, None)
            
            mock_client.get_account_by_id.return_value = mock_account
            
            response = client.get(
                f"/api/account/{sample_account_id}/pii",
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Should handle missing attributes gracefully
            assert data["success"] is True
            pii_data = data["data"]
            assert pii_data["identity"]["given_name"] == "John"
            assert pii_data["identity"]["family_name"] == "Doe"
            assert pii_data["contact"]["email"] is None
            assert pii_data["contact"]["phone"] is None

    def test_street_address_array_handling(self, api_key_setup, sample_account_id):
        """Test that street_address arrays are handled correctly."""
        with patch('api_server.broker_client') as mock_client:
            mock_account = Mock()
            mock_account.street_address = ["123 Main St", "Apt 4B"]
            mock_account.given_name = "John"
            mock_account.family_name = "Doe"
            # Set up all attributes that the API might access
            for attr in ['email', 'phone', 'city', 'state', 'postal_code', 'country', 'date_of_birth',
                        'middle_name', 'tax_id', 'tax_id_type', 'country_of_citizenship', 'country_of_birth',
                        'country_of_tax_residence', 'funding_source', 'is_control_person', 
                        'is_affiliated_exchange_or_finra', 'is_politically_exposed', 'immediate_family_exposed',
                        'account_number', 'created_at', 'status']:
                setattr(mock_account, attr, None)
            
            mock_client.get_account_by_id.return_value = mock_account
            
            response = client.get(
                f"/api/account/{sample_account_id}/pii",
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Should preserve array structure as returned by API
            assert data["success"] is True
            pii_data = data["data"]
            assert pii_data["contact"]["street_address"] == ["123 Main St", "Apt 4B"]


class TestPIIEndpointsSecurity:
    """Security-focused tests for PII endpoints."""
    
    @pytest.fixture
    def api_key_setup(self):
        """Set up API key environment for testing."""
        test_api_key = "test-api-key-12345"
        with patch.dict(os.environ, {'BACKEND_API_KEY': test_api_key}):
            yield test_api_key

    def test_pii_endpoints_require_api_key(self):
        """Test that all PII endpoints require valid API key."""
        sample_account_id = str(uuid.uuid4())
        
        # Test GET endpoint
        response = client.get(f"/api/account/{sample_account_id}/pii")
        assert response.status_code == 401
        
        # Test PATCH endpoint
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json={"phone_number": "+1234567890"}
        )
        assert response.status_code == 401
        
        # Test updateable fields endpoint
        response = client.get(f"/api/account/{sample_account_id}/pii/updateable-fields")
        assert response.status_code == 401

    def test_pii_endpoints_with_invalid_api_key(self, api_key_setup):
        """Test PII endpoints with invalid API key."""
        sample_account_id = str(uuid.uuid4())
        
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"x-api-key": "invalid-key"}
        )
        assert response.status_code == 401

    def test_pii_data_does_not_expose_sensitive_info(self, api_key_setup):
        """Test that PII data doesn't expose overly sensitive information."""
        sample_account_id = str(uuid.uuid4())
        
        with patch('api_server.broker_client') as mock_client:
            mock_account = Mock()
            # Set up account with various attributes
            mock_account.given_name = "John"
            mock_account.family_name = "Doe"
            mock_account.email = "john@example.com"
            mock_account.phone = "+1234567890"
            mock_account.street_address = ["123 Main St"]
            mock_account.city = "New York"
            mock_account.state = "NY"
            mock_account.postal_code = "10001"
            mock_account.country = "USA"
            mock_account.date_of_birth = "1990-01-01"
            
            # Set up all attributes that the API might access
            for attr in ['middle_name', 'tax_id', 'tax_id_type', 'country_of_citizenship', 'country_of_birth',
                        'country_of_tax_residence', 'funding_source', 'is_control_person', 
                        'is_affiliated_exchange_or_finra', 'is_politically_exposed', 'immediate_family_exposed',
                        'account_number', 'created_at', 'status']:
                setattr(mock_account, attr, None)
            
            # These attributes should NOT be exposed in PII response
            mock_account.ssn = "123-45-6789"  # Should never be exposed
            mock_account.internal_id = "internal-123"  # Should never be exposed
            
            mock_client.get_account_by_id.return_value = mock_account
            
            response = client.get(
                f"/api/account/{sample_account_id}/pii",
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify sensitive data is NOT included
            pii_data = data["data"]
            assert "ssn" not in pii_data
            assert "internal_id" not in pii_data
            
            # Verify appropriate data IS included
            assert pii_data["identity"]["given_name"] == "John"
            assert pii_data["contact"]["email"] == "john@example.com" 