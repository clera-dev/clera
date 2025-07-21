#!/usr/bin/env python3

import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, date
from uuid import UUID

from alpaca.broker.client import BrokerClient
from alpaca.broker.models.documents import TradeDocument
from alpaca.broker.enums import TradeDocumentType, TradeDocumentSubType
from alpaca.broker.requests import GetTradeDocumentsRequest

from .broker_client_factory import get_broker_client

logger = logging.getLogger("alpaca-trade-documents")

class TradeDocumentService:
    """
    Service class for managing trade documents and statements.
    
    Follows SOLID principles:
    - Single Responsibility: Handles only trade document operations
    - Open/Closed: Can be extended without modification
    - Dependency Inversion: Depends on BrokerClient abstraction
    """
    
    def __init__(self, broker_client: Optional[BrokerClient] = None):
        """
        Initialize the service with an optional broker client.
        
        Args:
            broker_client: Optional existing broker client. If None, creates a new one.
        """
        self.broker_client = broker_client or get_broker_client()
    
    def get_trade_documents(
        self, 
        account_id: str, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        document_type: Optional[TradeDocumentType] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all trade documents for an account with optional filtering.
        
        Args:
            account_id: Alpaca account ID
            start_date: Optional start date filter
            end_date: Optional end date filter
            document_type: Optional document type filter
            
        Returns:
            List of trade document dictionaries
            
        Raises:
            ValueError: If account_id is invalid
            Exception: If Alpaca API call fails
        """
        try:
            # Validate account_id
            if not account_id:
                raise ValueError("Account ID is required")
            
            # Create filter request
            filter_request = GetTradeDocumentsRequest(
                start=start_date,
                end=end_date,
                type=document_type
            )
            
            logger.info(f"Fetching trade documents for account {account_id} with filters: start={start_date}, end={end_date}, type={document_type}")
            
            # Get documents from Alpaca
            documents = self.broker_client.get_trade_documents_for_account(
                account_id=account_id,
                documents_filter=filter_request
            )
            
            # Convert to serializable format
            result = []
            for doc in documents:
                doc_dict = {
                    "id": str(doc.id),
                    "name": doc.name,
                    "type": doc.type.value if doc.type else None,
                    "sub_type": doc.sub_type.value if doc.sub_type else None,
                    "date": doc.date.isoformat() if doc.date else None,
                    "display_name": self._get_display_name(doc),
                    "description": self._get_description(doc)
                }
                result.append(doc_dict)
            
            logger.info(f"Retrieved {len(result)} documents for account {account_id}")
            return result
            
        except Exception as e:
            logger.error(f"Error fetching trade documents for account {account_id}: {str(e)}")
            raise
    
    def get_document_by_id(self, account_id: str, document_id: str) -> Dict[str, Any]:
        """
        Get a specific trade document by its ID.
        
        Args:
            account_id: Alpaca account ID
            document_id: Trade document ID
            
        Returns:
            Trade document dictionary
            
        Raises:
            ValueError: If account_id or document_id is invalid
            Exception: If Alpaca API call fails
        """
        try:
            # Validate inputs
            if not account_id:
                raise ValueError("Account ID is required")
            if not document_id:
                raise ValueError("Document ID is required")
            
            logger.info(f"Fetching trade document {document_id} for account {account_id}")
            
            # Get document from Alpaca
            document = self.broker_client.get_trade_document_for_account_by_id(
                account_id=account_id,
                document_id=document_id
            )
            
            # Convert to serializable format
            result = {
                "id": str(document.id),
                "name": document.name,
                "type": document.type.value if document.type else None,
                "sub_type": document.sub_type.value if document.sub_type else None,
                "date": document.date.isoformat() if document.date else None,
                "display_name": self._get_display_name(document),
                "description": self._get_description(document)
            }
            
            logger.info(f"Retrieved document {document_id} for account {account_id}")
            return result
            
        except Exception as e:
            logger.error(f"Error fetching trade document {document_id} for account {account_id}: {str(e)}")
            raise
    
    def download_document(self, account_id: str, document_id: str, file_path: str) -> None:
        """
        Download a trade document to a specified file path.
        
        Args:
            account_id: Alpaca account ID
            document_id: Trade document ID
            file_path: Local file path to save the document
            
        Raises:
            ValueError: If any required parameter is missing
            Exception: If Alpaca API call fails
        """
        try:
            # Validate inputs
            if not account_id:
                raise ValueError("Account ID is required")
            if not document_id:
                raise ValueError("Document ID is required")
            if not file_path:
                raise ValueError("File path is required")
            
            logger.info(f"Downloading trade document {document_id} for account {account_id} to {file_path}")
            
            # Download document from Alpaca
            self.broker_client.download_trade_document_for_account_by_id(
                account_id=account_id,
                document_id=document_id,
                file_path=file_path
            )
            
            logger.info(f"Successfully downloaded document {document_id} to {file_path}")
            
        except Exception as e:
            logger.error(f"Error downloading trade document {document_id} for account {account_id}: {str(e)}")
            raise
    

    
    def _get_display_name(self, document: TradeDocument) -> str:
        """
        Generate a user-friendly display name for a document.
        
        Args:
            document: TradeDocument instance
            
        Returns:
            User-friendly display name
        """
        if document.name:
            return document.name
        
        # Generate name based on type
        type_names = {
            TradeDocumentType.ACCOUNT_STATEMENT: "Account Statement",
            TradeDocumentType.TRADE_CONFIRMATION: "Trade Confirmation",
            TradeDocumentType.TRADE_CONFIRMATION_JSON: "Trade Confirmation (JSON)",
            TradeDocumentType.TAX_STATEMENT: "Tax Statement",
            TradeDocumentType.ACCOUNT_APPLICATION: "Account Application",
            TradeDocumentType.TAX_1099_B_DETAILS: "1099-B Tax Details",
            TradeDocumentType.TAX_1099_B_FORM: "1099-B Tax Form",
            TradeDocumentType.TAX_1099_DIV_DETAILS: "1099-DIV Tax Details",
            TradeDocumentType.TAX_1099_DIV_FORM: "1099-DIV Tax Form",
            TradeDocumentType.TAX_1099_INT_DETAILS: "1099-INT Tax Details",
            TradeDocumentType.TAX_1099_INT_FORM: "1099-INT Tax Form",
            TradeDocumentType.TAX_W8: "W-8 Tax Form"
        }
        
        base_name = type_names.get(document.type, "Document")
        
        if document.date:
            return f"{base_name} - {document.date.strftime('%B %Y')}"
        
        return base_name
    
    def _get_description(self, document: TradeDocument) -> str:
        """
        Generate a description for a document.
        
        Args:
            document: TradeDocument instance
            
        Returns:
            Document description
        """
        descriptions = {
            TradeDocumentType.ACCOUNT_STATEMENT: "Monthly account statement showing your portfolio activity and balances",
            TradeDocumentType.TRADE_CONFIRMATION: "Confirmation of executed trades and transactions",
            TradeDocumentType.TRADE_CONFIRMATION_JSON: "Machine-readable trade confirmation data",
            TradeDocumentType.TAX_STATEMENT: "Tax reporting statement for your trading activity",
            TradeDocumentType.ACCOUNT_APPLICATION: "Your original account application documents",
            TradeDocumentType.TAX_1099_B_DETAILS: "Detailed 1099-B tax information for capital gains reporting",
            TradeDocumentType.TAX_1099_B_FORM: "Official 1099-B tax form for filing with the IRS",
            TradeDocumentType.TAX_1099_DIV_DETAILS: "Detailed 1099-DIV tax information for dividend income",
            TradeDocumentType.TAX_1099_DIV_FORM: "Official 1099-DIV tax form for filing with the IRS",
            TradeDocumentType.TAX_1099_INT_DETAILS: "Detailed 1099-INT tax information for interest income",
            TradeDocumentType.TAX_1099_INT_FORM: "Official 1099-INT tax form for filing with the IRS",
            TradeDocumentType.TAX_W8: "W-8 tax form for foreign account holders"
        }
        
        return descriptions.get(document.type, "Trading-related document")


# Factory function for dependency injection
def create_trade_document_service(broker_client: Optional[BrokerClient] = None) -> TradeDocumentService:
    """
    Create a TradeDocumentService instance.
    
    Args:
        broker_client: Optional existing broker client
        
    Returns:
        TradeDocumentService instance
    """
    return TradeDocumentService(broker_client)


# Convenience functions that maintain the existing API pattern
def get_trade_documents_for_account(
    account_id: str, 
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    document_type: Optional[TradeDocumentType] = None,
    broker_client: Optional[BrokerClient] = None
) -> List[Dict[str, Any]]:
    """
    Convenience function to get trade documents for an account.
    
    Args:
        account_id: Alpaca account ID
        start_date: Optional start date filter
        end_date: Optional end date filter
        document_type: Optional document type filter
        broker_client: Optional existing broker client
        
    Returns:
        List of trade document dictionaries
    """
    service = create_trade_document_service(broker_client)
    return service.get_trade_documents(account_id, start_date, end_date, document_type)


def get_trade_document_by_id(
    account_id: str, 
    document_id: str,
    broker_client: Optional[BrokerClient] = None
) -> Dict[str, Any]:
    """
    Convenience function to get a specific trade document by ID.
    
    Args:
        account_id: Alpaca account ID
        document_id: Trade document ID
        broker_client: Optional existing broker client
        
    Returns:
        Trade document dictionary
    """
    service = create_trade_document_service(broker_client)
    return service.get_document_by_id(account_id, document_id)


def download_trade_document(
    account_id: str, 
    document_id: str, 
    file_path: str,
    broker_client: Optional[BrokerClient] = None
) -> None:
    """
    Convenience function to download a trade document.
    
    Args:
        account_id: Alpaca account ID
        document_id: Trade document ID
        file_path: Local file path to save the document
        broker_client: Optional existing broker client
    """
    service = create_trade_document_service(broker_client)
    service.download_document(account_id, document_id, file_path) 

 