"""
Comprehensive tests for PersonalizationService.
Tests database integration, context formatting, system prompt injection, and security.

This test suite ensures production-ready quality with proper error handling,
security measures, and edge case coverage.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from dataclasses import dataclass
from typing import Dict, Any, Optional

# Import the service we're testing
from utils.personalization_service import (
    PersonalizationService, 
    PersonalizationContext,
    create_personalized_supervisor_prompt
)


class TestPersonalizationContext:
    """Test the PersonalizationContext dataclass."""
    
    def test_has_any_context_with_data(self):
        """Test has_any_context returns True when data exists."""
        context = PersonalizationContext(
            user_name="John",
            investment_goals="Save for retirement"
        )
        assert context.has_any_context() is True
    
    def test_has_any_context_empty(self):
        """Test has_any_context returns False when no data exists."""
        context = PersonalizationContext()
        assert context.has_any_context() is False
    
    def test_to_prompt_sections(self):
        """Test conversion to prompt sections."""
        context = PersonalizationContext(
            user_name="John",
            investment_goals="Save for retirement",
            risk_tolerance_guidance="Conservative approach"
        )
        
        sections = context.to_prompt_sections()
        
        assert len(sections) == 3
        assert "The user's name is John." in sections
        assert "Save for retirement" in sections
        assert "Conservative approach" in sections


class TestPersonalizationService:
    """Test the PersonalizationService class."""
    
    def test_get_user_personalization_context_success(self):
        """Test successful personalization context retrieval."""
        mock_data = {
            'first_name': 'John',
            'investment_goals': ['retirement', 'house'],
            'risk_tolerance': 'moderate',
            'investment_timeline': '5_to_10_years',
            'experience_level': 'comfortable',
            'monthly_investment_goal': 500,
            'market_interests': ['ai_tech', 'healthcare']
        }
        
        with patch('utils.personalization_service.get_supabase_client') as mock_client:
            # Mock the Supabase query chain
            mock_table = Mock()
            mock_select = Mock()
            mock_eq = Mock()
            mock_execute = Mock()
            
            mock_response = Mock()
            mock_response.data = [mock_data]  # Supabase returns list
            
            mock_client.return_value.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.execute.return_value = mock_response
            
            context = PersonalizationService.get_user_personalization_context('user123')
            
            # Verify the context was properly formatted
            assert context.user_name == 'John'
            assert 'Saving for retirement, Buying a house' in context.investment_goals
            assert 'moderate risk tolerance' in context.risk_tolerance_guidance
            assert '$500' in context.monthly_budget_guidance
            assert 'AI & Technology, Healthcare & Biotech' in context.market_interests
            
            # Verify Supabase was called correctly
            mock_client.return_value.table.assert_called_once_with('user_personalization')
            mock_table.select.assert_called_once_with('*')
            mock_select.eq.assert_called_once_with('user_id', 'user123')
    
    def test_get_user_personalization_context_no_data(self):
        """Test graceful handling when no personalization data exists."""
        with patch('utils.personalization_service.get_supabase_client') as mock_client:
            mock_response = Mock()
            mock_response.data = []  # No data found
            
            mock_client.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
            
            context = PersonalizationService.get_user_personalization_context('user123')
            
            # Should return empty context
            assert context.user_name is None
            assert context.investment_goals is None
            assert not context.has_any_context()
    
    def test_get_user_personalization_context_empty_user_id(self):
        """Test handling of empty user_id."""
        context = PersonalizationService.get_user_personalization_context('')
        
        # Should return empty context without making DB call
        assert not context.has_any_context()
    
    def test_get_user_personalization_context_database_error(self):
        """Test error handling when database fails."""
        with patch('utils.personalization_service.get_supabase_client') as mock_client:
            mock_client.side_effect = Exception("Database connection failed")
            
            # Should re-raise the exception
            with pytest.raises(Exception, match="Database connection failed"):
                PersonalizationService.get_user_personalization_context('user123')
    
    def test_format_personalization_context_comprehensive(self):
        """Test comprehensive data formatting."""
        data = {
            'first_name': 'Alice',
            'investment_goals': ['retirement', 'big_purchase', 'not_sure'],
            'risk_tolerance': 'aggressive',
            'investment_timeline': '10_plus_years',
            'experience_level': 'professional',
            'monthly_investment_goal': 1000,
            'market_interests': ['ai_tech', 'healthcare', 'clean_energy']
        }
        
        context = PersonalizationService._format_personalization_context(data)
        
        # Verify all fields are properly formatted
        assert context.user_name == 'Alice'
        assert 'Saving for retirement, Saving for a big purchase, Not sure yet' in context.investment_goals
        assert 'aggressive risk tolerance' in context.risk_tolerance_guidance
        assert 'higher returns' in context.risk_tolerance_guidance
        assert 'Very long timeline (10+ years)' in context.timeline_guidance
        assert 'professional investment experience' in context.experience_guidance
        assert '$1000' in context.monthly_budget_guidance
        assert 'AI & Technology, Healthcare & Biotech, Clean Energy' in context.market_interests
    
    def test_format_personalization_context_partial_data(self):
        """Test formatting with only partial data."""
        data = {
            'first_name': 'Bob',
            'risk_tolerance': 'conservative',
            # Missing other fields
        }
        
        context = PersonalizationService._format_personalization_context(data)
        
        assert context.user_name == 'Bob'
        assert context.risk_tolerance_guidance is not None
        assert 'conservative' in context.risk_tolerance_guidance
        
        # Other fields should be None
        assert context.investment_goals is None
        assert context.timeline_guidance is None
    
    def test_sanitize_name_security(self):
        """Test name sanitization for security."""
        test_cases = [
            # (input, expected_characteristics)
            ("John\x00Doe", "JohnDoe"),  # Null byte removal
            ("John\nDoe", "JohnDoe"),    # Newline removal
            ("John\tDoe", "JohnDoe"),    # Tab removal
            ("  John Doe  ", "John Doe"),  # Whitespace trimming
            ("A" * 100, 50),             # Length limiting (first 50 chars)
            ("", ""),                     # Empty string
            ("Müller", "Müller"),        # Unicode support
        ]
        
        for test_input, expected in test_cases:
            if isinstance(expected, int):
                # Length test
                result = PersonalizationService._sanitize_name(test_input)
                assert len(result) <= expected
            else:
                # Content test
                result = PersonalizationService._sanitize_name(test_input)
                assert result == expected
            
            # Security checks
            result = PersonalizationService._sanitize_name(test_input)
            assert '\x00' not in result
            assert '\n' not in result
            assert '\t' not in result
    
    def test_risk_guidance_mapping(self):
        """Test risk tolerance guidance mapping."""
        test_cases = [
            ('conservative', 'capital preservation'),
            ('moderate', 'balanced portfolios'),
            ('aggressive', 'higher returns'),
            ('unknown_risk', 'balanced investment advice')  # Fallback
        ]
        
        for risk_level, expected_content in test_cases:
            guidance = PersonalizationService._get_risk_guidance(risk_level)
            assert expected_content in guidance.lower()
    
    def test_timeline_guidance_mapping(self):
        """Test timeline guidance mapping."""
        test_cases = [
            ('less_than_1_year', 'liquid, low-risk'),
            ('1_to_3_years', 'moderately conservative'),
            ('3_to_5_years', 'balanced approach'),
            ('5_to_10_years', 'more risk'),
            ('10_plus_years', 'long-term growth'),
            ('unknown_timeline', 'time horizon')  # Fallback
        ]
        
        for timeline, expected_content in test_cases:
            guidance = PersonalizationService._get_timeline_guidance(timeline)
            assert expected_content in guidance.lower()
    
    def test_experience_guidance_mapping(self):
        """Test experience level guidance mapping."""
        test_cases = [
            ('no_experience', 'simple, clear language'),
            ('some_familiarity', 'building on their basic knowledge'),
            ('comfortable', 'advanced investment terminology'),
            ('professional', 'professional language'),
            ('unknown_level', 'knowledge level')  # Fallback
        ]
        
        for experience, expected_content in test_cases:
            guidance = PersonalizationService._get_experience_guidance(experience)
            assert expected_content in guidance.lower()
    
    def test_build_personalized_system_prompt_with_context(self):
        """Test system prompt enhancement with personalization."""
        base_prompt = "You are Clera, a financial advisor."
        
        mock_config = {
            'configurable': {'user_id': 'user123'}
        }
        
        mock_context = PersonalizationContext(
            user_name='John',
            investment_goals='User wants to save for retirement.',
            risk_tolerance_guidance='User has moderate risk tolerance.'
        )
        
        with patch('utils.personalization_service.get_config', return_value=mock_config):
            with patch.object(PersonalizationService, 'get_user_personalization_context', return_value=mock_context):
                enhanced_prompt = PersonalizationService.build_personalized_system_prompt(base_prompt)
                
                # Verify enhancement
                assert base_prompt in enhanced_prompt
                assert 'USER PERSONALIZATION CONTEXT:' in enhanced_prompt
                assert 'John' in enhanced_prompt
                assert 'retirement' in enhanced_prompt
                assert 'moderate risk tolerance' in enhanced_prompt
                assert 'tailor your responses' in enhanced_prompt.lower()
    
    def test_build_personalized_system_prompt_no_config(self):
        """Test fallback behavior when no config available."""
        base_prompt = "You are Clera, a financial advisor."
        
        with patch('utils.personalization_service.get_config', side_effect=Exception("No config")):
            enhanced_prompt = PersonalizationService.build_personalized_system_prompt(base_prompt)
            
            # Should fallback gracefully
            assert enhanced_prompt == base_prompt
    
    def test_build_personalized_system_prompt_no_user_id(self):
        """Test fallback when user_id is missing from config."""
        base_prompt = "You are Clera, a financial advisor."
        
        mock_config = {
            'configurable': {}  # No user_id
        }
        
        with patch('utils.personalization_service.get_config', return_value=mock_config):
            enhanced_prompt = PersonalizationService.build_personalized_system_prompt(base_prompt)
            
            # Should fallback gracefully
            assert enhanced_prompt == base_prompt
    
    def test_build_personalized_system_prompt_no_personalization_data(self):
        """Test behavior when user has no personalization data."""
        base_prompt = "You are Clera, a financial advisor."
        
        mock_config = {
            'configurable': {'user_id': 'user123'}
        }
        
        empty_context = PersonalizationContext()  # No data
        
        with patch('utils.personalization_service.get_config', return_value=mock_config):
            with patch.object(PersonalizationService, 'get_user_personalization_context', return_value=empty_context):
                enhanced_prompt = PersonalizationService.build_personalized_system_prompt(base_prompt)
                
                # Should return base prompt when no personalization data
                assert enhanced_prompt == base_prompt
    
    def test_build_personalized_system_prompt_database_error(self):
        """Test graceful handling of database errors."""
        base_prompt = "You are Clera, a financial advisor."
        
        mock_config = {
            'configurable': {'user_id': 'user123'}
        }
        
        with patch('utils.personalization_service.get_config', return_value=mock_config):
            with patch.object(PersonalizationService, 'get_user_personalization_context', side_effect=Exception("DB Error")):
                enhanced_prompt = PersonalizationService.build_personalized_system_prompt(base_prompt)
                
                # Should fallback gracefully on error
                assert enhanced_prompt == base_prompt


class TestCreatePersonalizedSupervisorPrompt:
    """Test the convenience function for graph.py integration."""
    
    def test_create_personalized_supervisor_prompt(self):
        """Test the convenience function integration."""
        class MockState:
            def __init__(self):
                self.messages = []
        
        mock_state = MockState()
        mock_config = {
            'configurable': {'user_id': 'user123'}
        }
        
        mock_context = PersonalizationContext(
            user_name='Alice',
            investment_goals='Save for house'
        )
        
        with patch.object(PersonalizationService, 'get_user_personalization_context', return_value=mock_context):
            # Mock the import of supervisor_clera_system_prompt
            mock_base_prompt = "Base supervisor prompt"
            with patch('utils.prompts.supervisor_prompt.get_supervisor_clera_system_prompt', return_value=mock_base_prompt):
                # Call with state and config as LangGraph would
                result = create_personalized_supervisor_prompt(mock_state, mock_config)
                
                # Result should be a list of messages
                assert isinstance(result, list)
                assert len(result) > 0
                
                # First message should be a SystemMessage with personalized content
                from langchain_core.messages import SystemMessage
                assert isinstance(result[0], SystemMessage)
                assert mock_base_prompt in result[0].content
                assert 'Alice' in result[0].content
                assert 'house' in result[0].content
    
    def test_create_personalized_supervisor_prompt_fallback(self):
        """Test fallback behavior of convenience function."""
        class MockState:
            def __init__(self):
                self.messages = []
        
        mock_state = MockState()
        
        # Test with None config (fallback scenario)
        # Mock the import
        mock_base_prompt = "Base supervisor prompt"
        with patch('utils.prompts.supervisor_prompt.get_supervisor_clera_system_prompt', return_value=mock_base_prompt):
            # When config is None, should use get_config() internally and fallback gracefully
            with patch('utils.personalization_service.get_config', side_effect=Exception("No config")):
                result = create_personalized_supervisor_prompt(mock_state, config=None)
                
                # Result should be a list of messages
                assert isinstance(result, list)
                assert len(result) > 0
                
                # Should fallback to base prompt
                from langchain_core.messages import SystemMessage
                assert isinstance(result[0], SystemMessage)
                assert result[0].content == mock_base_prompt


class TestIntegrationScenarios:
    """Test realistic integration scenarios."""
    
    def test_full_personalization_flow(self):
        """Test complete personalization flow with realistic data."""
        # Realistic user data
        user_data = {
            'first_name': 'Sarah',
            'investment_goals': ['retirement', 'house'],
            'risk_tolerance': 'moderate',
            'investment_timeline': '5_to_10_years', 
            'experience_level': 'some_familiarity',
            'monthly_investment_goal': 750,
            'market_interests': ['ai_tech', 'healthcare']
        }
        
        config = {
            'configurable': {'user_id': 'user456', 'account_id': 'acc123'}
        }
        
        with patch('utils.personalization_service.get_supabase_client') as mock_client:
            mock_response = Mock()
            mock_response.data = [user_data]
            mock_client.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
            
            # Test the full flow
            base_prompt = "You are Clera, created by Clera, Inc."
            enhanced_prompt = PersonalizationService.build_personalized_system_prompt(base_prompt, config)
            
            # Verify all elements are present
            assert base_prompt in enhanced_prompt
            assert 'Sarah' in enhanced_prompt
            assert 'retirement' in enhanced_prompt
            assert 'house' in enhanced_prompt
            assert 'moderate risk tolerance' in enhanced_prompt
            assert '5-10 years' in enhanced_prompt
            assert 'some investment familiarity' in enhanced_prompt
            assert '$750' in enhanced_prompt
            assert 'AI & Technology' in enhanced_prompt
            assert 'Healthcare & Biotech' in enhanced_prompt
            assert 'USER PERSONALIZATION CONTEXT:' in enhanced_prompt
            assert 'tailor your responses' in enhanced_prompt
    
    def test_edge_case_data_types(self):
        """Test handling of edge case data types from database."""
        edge_case_data = {
            'first_name': 123,  # Wrong type
            'investment_goals': 'not_a_list',  # Wrong type
            'monthly_investment_goal': 'not_a_number',  # Wrong type
            'market_interests': None,  # Null value
        }
        
        # Should not crash, should handle gracefully
        context = PersonalizationService._format_personalization_context(edge_case_data)
        
        # Should have empty context due to type mismatches
        assert not context.has_any_context()
    
    def test_performance_considerations(self):
        """Test that the service handles large data efficiently."""
        # Large dataset simulation
        large_data = {
            'first_name': 'A' * 1000,  # Very long name
            'investment_goals': ['goal' + str(i) for i in range(100)],  # Many goals
            'market_interests': ['interest' + str(i) for i in range(100)]  # Many interests
        }
        
        context = PersonalizationService._format_personalization_context(large_data)
        
        # Should handle large data but with reasonable limits
        assert len(context.user_name) <= 50  # Name truncation
        # Should still process the data without crashing
        assert context.has_any_context()


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
