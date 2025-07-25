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

import jwt
from datetime import datetime, timedelta

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "test-secret")

def generate_jwt(user_id, exp_minutes=60):
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "exp": datetime.utcnow() + timedelta(minutes=exp_minutes),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")

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
    def mock_account_ownership(self, sample_account_id):
        """Mock the Supabase account ownership lookup."""
        with patch('utils.supabase.db_client.get_user_alpaca_account_id') as mock_get:
            # Map our test user UUID to the test account ID being used in the test
            def get_account_id(user_id):
                if user_id == "12345678-1234-1234-1234-123456789012":
                    return sample_account_id
                return None
            mock_get.side_effect = get_account_id
            yield mock_get

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

    def test_get_account_pii_success(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
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

    def test_get_account_pii_unauthorized(self, mock_account_ownership):
        """Test PII retrieval without API key."""
        sample_account_id = str(uuid.uuid4())
        response = client.get(f"/api/account/{sample_account_id}/pii")
        assert response.status_code == 401

    def test_get_account_pii_broker_client_not_initialized(self, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII retrieval when broker client is not initialized."""
        with patch('api_server.broker_client', None):
            response = client.get(
                f"/api/account/{sample_account_id}/pii",
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 503

    def test_get_account_pii_alpaca_error(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII retrieval when Alpaca API returns an error."""
        mock_broker_client.get_account_by_id.side_effect = Exception("Alpaca API error")
        
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 500

    def test_update_account_pii_success(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
        """Test successful PII update."""
        update_data = {
            "identity": {
                "given_name": "Jane"
            },
            "contact": {
                "phone": "+1987654321"
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

    def test_update_account_pii_with_update_request(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII update with update request object."""
        
        update_data = {
            "contact": {
                "phone": "+1999888777"
            }
        }
        
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200

    def test_update_account_pii_no_updateable_fields(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII update when no fields are updateable."""
        # Mock empty updateable fields
        with patch('utils.pii_management.PIIManagementService.get_updateable_fields') as mock_updateable:
            mock_updateable.return_value = {"contact": {}, "identity": {}, "disclosures": {}}
            
            update_data = {
                "contact": {
                    "phone": "+1555444333"
                }
            }
            
            response = client.patch(
                f"/api/account/{sample_account_id}/pii",
                json=update_data,
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 200

    def test_update_account_pii_alpaca_restriction_error(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII update when Alpaca API returns restriction error."""
        mock_broker_client.update_account.side_effect = Exception("Phone number cannot be updated")
        
        update_data = {
            "contact": {
                "phone": "+1222333444"
            }
        }
        
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 200

    def test_update_account_pii_general_alpaca_error(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII update when Alpaca API returns a general error."""
        mock_broker_client.update_account.side_effect = Exception("General Alpaca error")
        
        update_data = {
            "contact": {
                "phone": "+1777888999"
            }
        }
        
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"x-api-key": api_key_setup}
        )
        
        assert response.status_code == 500

    def test_get_updateable_pii_fields_success(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
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

    def test_get_updateable_pii_fields_with_descriptions(self, mock_account_ownership, api_key_setup, sample_account_id):
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

    def test_update_account_pii_empty_request(self, mock_broker_client, mock_account_ownership, api_key_setup, sample_account_id):
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

    def test_update_account_pii_invalid_json(self, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII update with invalid JSON."""
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            data="invalid json",
            headers={"x-api-key": api_key_setup, "Content-Type": "application/json"}
        )
        
        assert response.status_code == 422  # FastAPI returns 422 for invalid JSON

    def test_pii_endpoints_handle_missing_account_attributes(self, mock_account_ownership, api_key_setup, sample_account_id):
        """Test PII endpoints handle accounts with missing attributes gracefully."""
        with patch('api_server.broker_client') as mock_client:
            # Create an account with missing attributes
            mock_account = Mock()
            mock_account.email = "test@example.com"
            # Deliberately missing other attributes
            mock_account.phone = None
            mock_account.street_address = None
            mock_account.city = None
            mock_account.state = None
            mock_account.postal_code = None
            mock_account.country = None
            mock_account.given_name = "John"
            mock_account.family_name = "Doe"
            
            mock_client.get_account_by_id.return_value = mock_account
            
            response = client.get(
                f"/api/account/{sample_account_id}/pii",
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            
            # Verify missing attributes are handled as None
            pii_data = data["data"]
            assert pii_data["contact"]["phone"] is None

    def test_street_address_array_handling(self, mock_account_ownership, api_key_setup, sample_account_id):
        """Test that street_address arrays are handled correctly."""
        with patch('api_server.broker_client') as mock_client:
            # Create an account with street_address as an array
            mock_account = Mock()
            mock_account.street_address = ["123 Main St", "Apt 4B"]
            mock_account.email = "test@example.com"
            mock_account.phone = "+1234567890"
            mock_account.city = "New York"
            mock_account.state = "NY"
            mock_account.postal_code = "10001"
            mock_account.country = "USA"
            mock_account.given_name = "John"
            mock_account.family_name = "Doe"
            
            mock_client.get_account_by_id.return_value = mock_account
            
            response = client.get(
                f"/api/account/{sample_account_id}/pii",
                headers={"x-api-key": api_key_setup}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            
            # Verify street_address is correctly handled
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

class TestPIIEndpointsJWT:
    @pytest.fixture
    def sample_account_id(self):
        return str(uuid.uuid4())

    @pytest.fixture
    def user_id(self):
        return "12345678-1234-1234-1234-123456789012"  # Use same UUID as authentication service expects

    @pytest.fixture
    def other_user_id(self):
        return "87654321-4321-4321-4321-210987654321"

    @pytest.fixture
    def valid_jwt(self, user_id):
        return generate_jwt(user_id)

    @pytest.fixture
    def other_jwt(self, other_user_id):
        return generate_jwt(other_user_id)

    @pytest.fixture
    def expired_jwt(self, user_id):
        return generate_jwt(user_id, exp_minutes=-1)

    @pytest.fixture
    def mock_account_ownership(self, user_id, sample_account_id):
        """Mock the Supabase account ownership lookup."""
        with patch('utils.supabase.db_client.get_user_alpaca_account_id') as mock_get:
            # Map our test user UUID to the test account ID being used in the test
            def get_account_id(uid):
                if uid == user_id:
                    return sample_account_id
                return None
            mock_get.side_effect = get_account_id
            yield mock_get

    def test_get_account_pii_jwt_success(self, mock_broker_client, mock_account_ownership, valid_jwt, sample_account_id):
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"Authorization": f"Bearer {valid_jwt}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data

    def test_get_account_pii_jwt_wrong_user(self, mock_broker_client, mock_account_ownership, other_jwt, sample_account_id):
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"Authorization": f"Bearer {other_jwt}"}
        )
        # Should be forbidden (user does not own this account)
        assert response.status_code == 403

    def test_get_account_pii_jwt_missing(self, sample_account_id):
        response = client.get(f"/api/account/{sample_account_id}/pii")
        assert response.status_code == 401

    def test_get_account_pii_jwt_expired(self, mock_broker_client, mock_account_ownership, expired_jwt, sample_account_id):
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"Authorization": f"Bearer {expired_jwt}"}
        )
        assert response.status_code == 401

    def test_patch_account_pii_jwt_success(self, mock_broker_client, mock_account_ownership, valid_jwt, sample_account_id):
        update_data = {"contact": {"phone": "+15555555555"}}
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"Authorization": f"Bearer {valid_jwt}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    def test_patch_account_pii_jwt_wrong_user(self, mock_broker_client, mock_account_ownership, other_jwt, sample_account_id):
        update_data = {"contact": {"phone": "+15555555555"}}
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"Authorization": f"Bearer {other_jwt}"}
        )
        assert response.status_code == 403

    def test_patch_account_pii_jwt_expired(self, mock_broker_client, mock_account_ownership, expired_jwt, sample_account_id):
        update_data = {"contact": {"phone": "+15555555555"}}
        response = client.patch(
            f"/api/account/{sample_account_id}/pii",
            json=update_data,
            headers={"Authorization": f"Bearer {expired_jwt}"}
        )
        assert response.status_code == 401

    def test_get_updateable_fields_jwt_success(self, mock_broker_client, mock_account_ownership, valid_jwt, sample_account_id):
        response = client.get(
            f"/api/account/{sample_account_id}/pii/updateable-fields",
            headers={"Authorization": f"Bearer {valid_jwt}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data

    def test_api_key_and_jwt_mutual_exclusion(self, mock_broker_client, mock_account_ownership, valid_jwt, api_key_setup, sample_account_id):
        # If both are present, JWT should take precedence (or test expected behavior)
        response = client.get(
            f"/api/account/{sample_account_id}/pii",
            headers={"Authorization": f"Bearer {valid_jwt}", "x-api-key": api_key_setup}
        )
        # Should succeed as JWT is valid
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True 