#!/usr/bin/env python3
"""
PII (Personally Identifiable Information) Management Module

This module handles all PII-related operations including:
- Fetching PII data from Alpaca
- Updating PII data in Alpaca
- Syncing PII changes to Supabase
- Managing updateable fields

This follows separation of concerns by extracting PII logic from the main API server.
"""

import logging
from typing import Dict, Any, Optional, List
from alpaca.broker.requests import UpdateAccountRequest, UpdatableContact
from utils.supabase.db_client import get_user_id_by_alpaca_account_id, update_user_onboarding_data

logger = logging.getLogger(__name__)


class PIIManagementService:
    """
    Service class for managing PII operations.
    Handles the business logic for PII data management.
    """
    
    def __init__(self, broker_client):
        """
        Initialize the PII management service.
        
        Args:
            broker_client: The Alpaca broker client instance
        """
        self.broker_client = broker_client
    
    def get_account_pii(self, account_id: str) -> Dict[str, Any]:
        """
        Get all personally identifiable information for an account.
        
        Args:
            account_id: The Alpaca account ID
            
        Returns:
            Dictionary containing PII data
            
        Raises:
            Exception: If account details cannot be retrieved
        """
        logger.info(f"Fetching PII for account: (redacted)")
        
        if not self.broker_client:
            logger.error("Broker client is not initialized.")
            raise Exception("Server configuration error: Broker client not available.")
        
        # Get account details from Alpaca
        account_details = self.broker_client.get_account_by_id(account_id)
        logger.info(f"Successfully retrieved account details for account: (redacted)")
        
        # Extract PII from account details
        pii_data = {
            "contact": {
                "email": getattr(account_details.contact, 'email_address', None) if hasattr(account_details, 'contact') and account_details.contact else None,
                "phone": getattr(account_details.contact, 'phone_number', None) if hasattr(account_details, 'contact') and account_details.contact else None,
                "street_address": getattr(account_details.contact, 'street_address', []) if hasattr(account_details, 'contact') and account_details.contact else [],
                "city": getattr(account_details.contact, 'city', None) if hasattr(account_details, 'contact') and account_details.contact else None,
                "state": getattr(account_details.contact, 'state', None) if hasattr(account_details, 'contact') and account_details.contact else None,
                "postal_code": getattr(account_details.contact, 'postal_code', None) if hasattr(account_details, 'contact') and account_details.contact else None,
                "country": getattr(account_details.contact, 'country', None) if hasattr(account_details, 'contact') and account_details.contact else None,
            },
            "identity": {
                "given_name": getattr(account_details, 'given_name', None),
                "middle_name": getattr(account_details, 'middle_name', None),
                "family_name": getattr(account_details, 'family_name', None),
                "date_of_birth": getattr(account_details, 'date_of_birth', None),
                "tax_id": getattr(account_details, 'tax_id', None),  # This will likely be masked
                "tax_id_type": getattr(account_details, 'tax_id_type', None),
                "country_of_citizenship": getattr(account_details, 'country_of_citizenship', None),
                "country_of_birth": getattr(account_details, 'country_of_birth', None),
                "country_of_tax_residence": getattr(account_details, 'country_of_tax_residence', None),
                "funding_source": getattr(account_details, 'funding_source', []),
            },
            "disclosures": {
                "is_control_person": getattr(account_details, 'is_control_person', None),
                "is_affiliated_exchange_or_finra": getattr(account_details, 'is_affiliated_exchange_or_finra', None),
                "is_politically_exposed": getattr(account_details, 'is_politically_exposed', None),
                "immediate_family_exposed": getattr(account_details, 'immediate_family_exposed', None),
            },
            "account_info": {
                "account_number": getattr(account_details, 'account_number', None),
                "status": getattr(account_details, 'status', None),
                "created_at": getattr(account_details, 'created_at', None),
            },
            "updateable_fields": [
                "contact.email",
                "contact.phone", 
                "contact.street_address",
                "contact.city",
                "contact.state",
                "contact.postal_code",
                # Note: Most identity fields are typically not updateable after account creation
                # This list should be updated based on Alpaca's specific limitations
            ]
        }
        
        return {"success": True, "data": pii_data}
    
    def update_account_pii(self, account_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update personally identifiable information for an account.
        
        Args:
            account_id: The Alpaca account ID
            update_data: Dictionary containing the fields to update
            
        Returns:
            Dictionary containing the update result
            
        Raises:
            Exception: If update fails
        """
        logger.info(f"Updating PII for account: (redacted)")
        # Log only the field names being updated, not the actual data
        if update_data:
            field_names = []
            if "contact" in update_data:
                field_names.extend([f"contact.{key}" for key in update_data["contact"].keys()])
            if "identity" in update_data:
                field_names.extend([f"identity.{key}" for key in update_data["identity"].keys()])
            if "disclosures" in update_data:
                field_names.extend([f"disclosures.{key}" for key in update_data["disclosures"].keys()])
            
            logger.info(f"PII update request fields: {field_names}")
        else:
            logger.info("PII update request: no data provided")
        
        if not self.broker_client:
            logger.error("Broker client is not initialized.")
            raise Exception("Server configuration error: Broker client not available.")
        
        # Build the update request based on what fields are provided and allowed to be updated
        contact_updates = {}
        
        # Handle contact information updates (these are typically updateable)
        if "contact" in update_data:
            contact_data = update_data["contact"]
            if "email" in contact_data:
                contact_updates["email_address"] = contact_data["email"]
            if "phone" in contact_data:
                contact_updates["phone_number"] = contact_data["phone"]
            if "street_address" in contact_data:
                contact_updates["street_address"] = contact_data["street_address"]
            if "city" in contact_data:
                contact_updates["city"] = contact_data["city"]
            if "state" in contact_data:
                contact_updates["state"] = contact_data["state"]
            if "postal_code" in contact_data:
                contact_updates["postal_code"] = contact_data["postal_code"]
        
        # Note: Identity fields like SSN, DOB, legal name are typically NOT updateable
        # after account creation for regulatory reasons. We should document this limitation.
        
        if not contact_updates:
            return {"success": False, "error": "No updateable fields provided"}
        
        # Create the update request with proper structure
        try:
            # Create UpdatableContact object if we have contact updates
            contact = None
            if contact_updates:
                contact = UpdatableContact(**contact_updates)
            
            # Create the UpdateAccountRequest
            update_request = UpdateAccountRequest(contact=contact)
            
            # Perform the update
            updated_account = self.broker_client.update_account(account_id, update_request)
            logger.info(f"Successfully updated account: (redacted)")
            
            # After successful Alpaca update, sync to Supabase
            self._sync_to_supabase(account_id, contact_updates)
            
            return {
                "success": True, 
                "message": "Account information updated successfully",
                "updated_fields": list(contact_updates.keys())
            }
            
        except Exception as update_error:
            logger.error(f"Alpaca API error updating account: {update_error}")
            # Handle specific Alpaca API errors
            error_message = str(update_error)
            if "not allowed" in error_message.lower() or "cannot be modified" in error_message.lower():
                return {
                    "success": False,
                    "error": "Some fields cannot be modified after account creation",
                    "details": error_message
                }
            else:
                raise Exception(f"Failed to update account: {error_message}")
    
    def _sync_to_supabase(self, account_id: str, contact_updates: Dict[str, Any]) -> None:
        """
        Sync PII updates to Supabase after successful Alpaca update.
        
        Args:
            account_id: The Alpaca account ID
            contact_updates: Dictionary of updated contact fields
        """
        try:
            # Get the user ID for this Alpaca account
            user_id = get_user_id_by_alpaca_account_id(account_id)
            
            if user_id:
                # Map the updated fields back to Supabase onboarding_data format
                supabase_updates = {}
                updated_email = None
                
                for alpaca_field, value in contact_updates.items():
                    # Map Alpaca field names back to Supabase field names
                    if alpaca_field == "email_address":
                        supabase_updates["email"] = value
                        updated_email = value  # Store the new email for auth update
                    elif alpaca_field == "phone_number":
                        supabase_updates["phoneNumber"] = value
                    elif alpaca_field == "street_address":
                        supabase_updates["streetAddress"] = value
                    elif alpaca_field == "city":
                        supabase_updates["city"] = value
                    elif alpaca_field == "state":
                        supabase_updates["state"] = value
                    elif alpaca_field == "postal_code":
                        supabase_updates["postalCode"] = value
                
                # Update Supabase onboarding data
                supabase_success = update_user_onboarding_data(user_id, supabase_updates)
                
                if supabase_success:
                    logger.info(f"Successfully synced updates to Supabase for user: (redacted)")
                    
                    # CRITICAL: Update Supabase Auth email if email was changed
                    if updated_email:
                        try:
                            from utils.supabase.db_client import get_supabase_client
                            supabase_admin = get_supabase_client()
                            
                            #Auth email for user {user_id} to new email: {updated_email}")
                            
                            # Update the user's authentication email
                            auth_response = supabase_admin.auth.admin.update_user_by_id(
                                user_id, {"email": updated_email}
                            )
                            
                            #if auth_response:
                                #logger.info(f"Successfully updated Supabase Auth email for user {user_id}")
                            #else:
                                #logger.error(f"Failed to update Supabase Auth email for user {user_id}: No response")
                                
                        except Exception as auth_error:
                            logger.error(f"Failed to update Supabase Auth email for user {user_id}: {auth_error}")
                            # Don't fail the entire request - the PII update was successful
                            # This is logged for monitoring and manual intervention if needed
                else:
                    logger.warning(f"Failed to sync updates to Supabase for user: (redacted)")
            else:
                logger.warning(f"Could not find user ID for Alpaca account: (redacted)")
                
        except Exception as supabase_error:
            logger.error(f"Error syncing to Supabase: {supabase_error}")
            # Don't fail the entire request if Supabase sync fails
            # The Alpaca update was successful, so we log the error but continue
    
    def get_updateable_fields(self, account_id: str) -> Dict[str, Any]:
        """
        Get the list of PII fields that can be updated.
        
        Returns:
            Dictionary containing updateable fields information
        """
        logger.info(f"Fetching updateable PII fields")
        
        # Define which fields are typically updateable vs. non-updateable
        # This is based on regulatory requirements and Alpaca's limitations
        updateable_fields = {
            "contact": {
                "email": {"updateable": True, "description": "Email address"},
                "phone": {"updateable": True, "description": "Phone number"},
                "street_address": {"updateable": True, "description": "Street address"},
                "city": {"updateable": True, "description": "City"},
                "state": {"updateable": True, "description": "State/Province"},
                "postal_code": {"updateable": True, "description": "Postal/ZIP code"},
                "country": {"updateable": False, "description": "Country (not updateable after account creation)"}
            },
            "identity": {
                "given_name": {"updateable": False, "description": "First name (not updateable after account creation)"},
                "middle_name": {"updateable": False, "description": "Middle name (not updateable after account creation)"},
                "family_name": {"updateable": False, "description": "Last name (not updateable after account creation)"},
                "date_of_birth": {"updateable": False, "description": "Date of birth (not updateable after account creation)"},
                "tax_id": {"updateable": False, "description": "Tax ID/SSN (not updateable after account creation)"},
                "tax_id_type": {"updateable": False, "description": "Tax ID type (not updateable after account creation)"},
                "country_of_citizenship": {"updateable": False, "description": "Country of citizenship (not updateable after account creation)"},
                "country_of_birth": {"updateable": False, "description": "Country of birth (not updateable after account creation)"},
                "country_of_tax_residence": {"updateable": False, "description": "Country of tax residence (not updateable after account creation)"},
                "funding_source": {"updateable": False, "description": "Funding sources (not updateable after account creation)"}
            },
            "disclosures": {
                "is_control_person": {"updateable": False, "description": "Control person status (not updateable after account creation)"},
                "is_affiliated_exchange_or_finra": {"updateable": False, "description": "FINRA affiliation (not updateable after account creation)"},
                "is_politically_exposed": {"updateable": False, "description": "Political exposure (not updateable after account creation)"},
                "immediate_family_exposed": {"updateable": False, "description": "Family political exposure (not updateable after account creation)"}
            }
        }
        
        return {
            "success": True,
            "data": updateable_fields,
            "notice": "Most identity and disclosure fields cannot be updated after account creation due to regulatory requirements. Contact support if you need to make changes to non-updateable fields."
        } 