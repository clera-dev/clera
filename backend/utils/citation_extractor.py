"""
Utility functions for extracting citations from tool results and messages.
Citations are embedded in tool results in the format: [CITATIONS_START:JSON_ARRAY:CITATIONS_END]
"""
import json
import re
from typing import List, Optional, Dict, Any
from langchain_core.messages import BaseMessage, ToolMessage, FunctionMessage

# Pattern to match citation metadata in tool results
CITATION_PATTERN = re.compile(r'\[CITATIONS_START:(.*?):CITATIONS_END\]', re.DOTALL)


def extract_citations_from_text(text: str) -> tuple[str, List[str]]:
    """
    Extract citations from text that contains citation metadata.
    
    Args:
        text: Text that may contain citation metadata at the end
        
    Returns:
        Tuple of (cleaned_text, citations_list)
    """
    if not text:
        return text, []
    
    # Try to find citation metadata
    match = CITATION_PATTERN.search(text)
    if match:
        try:
            citations_json = match.group(1)
            citations = json.loads(citations_json)
            if isinstance(citations, list):
                # Remove citation metadata from text
                cleaned_text = CITATION_PATTERN.sub('', text).strip()
                return cleaned_text, citations
        except (json.JSONDecodeError, Exception) as e:
            print(f"[CitationExtractor] Error parsing citations: {e}")
            return text, []
    
    return text, []


def extract_citations_from_message(message: BaseMessage) -> List[str]:
    """
    Extract citations from a LangChain message (tool result or AI message).
    
    Args:
        message: LangChain message that may contain citations
        
    Returns:
        List of citation URLs
    """
    citations = []
    
    # Check message content
    if hasattr(message, 'content') and message.content:
        content = message.content
        if isinstance(content, str):
            _, extracted_citations = extract_citations_from_text(content)
            citations.extend(extracted_citations)
        elif isinstance(content, list):
            # Handle list content format
            for item in content:
                if isinstance(item, str):
                    _, extracted_citations = extract_citations_from_text(item)
                    citations.extend(extracted_citations)
                elif isinstance(item, dict):
                    text = item.get('text', '') or item.get('content', '')
                    if text:
                        _, extracted_citations = extract_citations_from_text(str(text))
                        citations.extend(extracted_citations)
    
    # Check additional_kwargs for citations
    if hasattr(message, 'additional_kwargs') and message.additional_kwargs:
        if 'citations' in message.additional_kwargs:
            citations_from_kwargs = message.additional_kwargs['citations']
            if isinstance(citations_from_kwargs, list):
                citations.extend(citations_from_kwargs)
    
    # Check response_metadata for citations
    if hasattr(message, 'response_metadata') and message.response_metadata:
        if 'citations' in message.response_metadata:
            citations_from_metadata = message.response_metadata['citations']
            if isinstance(citations_from_metadata, list):
                citations.extend(citations_from_metadata)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_citations = []
    for citation in citations:
        if citation and citation not in seen:
            seen.add(citation)
            unique_citations.append(citation)
    
    return unique_citations


def extract_citations_from_messages(messages: List[BaseMessage]) -> List[str]:
    """
    Extract and aggregate citations from a list of messages.
    Typically used to collect citations from tool results.
    
    Args:
        messages: List of LangChain messages
        
    Returns:
        Aggregated list of unique citation URLs
    """
    all_citations = []
    
    for message in messages:
        # Extract from tool messages (tool results)
        if isinstance(message, (ToolMessage, FunctionMessage)):
            citations = extract_citations_from_message(message)
            all_citations.extend(citations)
        # Also check AI messages in case citations were added there
        elif hasattr(message, 'type') and message.type == 'ai':
            citations = extract_citations_from_message(message)
            all_citations.extend(citations)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_citations = []
    for citation in all_citations:
        if citation and citation not in seen:
            seen.add(citation)
            unique_citations.append(citation)
    
    return unique_citations


def add_citations_to_message(message: BaseMessage, citations: List[str]) -> BaseMessage:
    """
    Add citations to a message's additional_kwargs so they appear in LangSmith traces.
    
    Args:
        message: LangChain message to add citations to
        citations: List of citation URLs
        
    Returns:
        Message with citations in additional_kwargs
    """
    if not citations:
        return message
    
    # Ensure additional_kwargs exists
    if not hasattr(message, 'additional_kwargs'):
        message.additional_kwargs = {}
    elif message.additional_kwargs is None:
        message.additional_kwargs = {}
    
    # Add citations to additional_kwargs
    existing_citations = message.additional_kwargs.get('citations', [])
    if not isinstance(existing_citations, list):
        existing_citations = []
    
    # Merge and deduplicate
    all_citations = existing_citations + citations
    seen = set()
    unique_citations = []
    for citation in all_citations:
        if citation and citation not in seen:
            seen.add(citation)
            unique_citations.append(citation)
    
    message.additional_kwargs['citations'] = unique_citations
    
    # Also add to response_metadata if it exists
    if hasattr(message, 'response_metadata') and message.response_metadata:
        message.response_metadata['citations'] = unique_citations
    
    return message

