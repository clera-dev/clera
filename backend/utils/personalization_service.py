"""
Production-ready personalization context service for LangGraph agents.
Fetches user personalization data and formats it for system prompt injection.

This service implements the Single Responsibility Principle by handling only
personalization context management, with clear separation from other concerns.
"""

import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from langgraph.types import RunnableConfig
from langgraph.config import get_config
from utils.supabase.db_client import get_supabase_client

logger = logging.getLogger(__name__)

@dataclass
class PersonalizationContext:
    """Structured personalization context for AI system prompt."""
    user_name: Optional[str] = None
    investment_goals: Optional[str] = None
    risk_tolerance_guidance: Optional[str] = None
    timeline_guidance: Optional[str] = None
    experience_guidance: Optional[str] = None
    monthly_budget_guidance: Optional[str] = None
    market_interests: Optional[str] = None
    
    def has_any_context(self) -> bool:
        """Check if any personalization context exists."""
        return any([
            self.user_name,
            self.investment_goals,
            self.risk_tolerance_guidance,
            self.timeline_guidance,
            self.experience_guidance,
            self.monthly_budget_guidance,
            self.market_interests
        ])
    
    def to_prompt_sections(self) -> List[str]:
        """Convert context to list of prompt sections."""
        sections = []
        
        if self.user_name:
            sections.append(f"The user's name is {self.user_name}.")
        
        if self.investment_goals:
            sections.append(self.investment_goals)
        
        if self.risk_tolerance_guidance:
            sections.append(self.risk_tolerance_guidance)
        
        if self.timeline_guidance:
            sections.append(self.timeline_guidance)
        
        if self.experience_guidance:
            sections.append(self.experience_guidance)
        
        if self.monthly_budget_guidance:
            sections.append(self.monthly_budget_guidance)
        
        if self.market_interests:
            sections.append(self.market_interests)
        
        return sections


class PersonalizationService:
    """Centralized service for user personalization context management."""
    
    # Investment goal descriptions mapping (from frontend types)
    INVESTMENT_GOAL_DESCRIPTIONS = {
        'retirement': 'Saving for retirement',
        'house': 'Buying a house',
        'big_purchase': 'Saving for a big purchase',
        'extra_income': 'To generate extra income every month',
        'pay_off_debt': 'To help pay off debt every month',
        'investing_for_fun': 'Investing for fun',
        'inheritance': 'Leave an inheritance',
        'travel': 'Travel',
        'not_sure': 'Not sure yet'
    }
    
    # Market interest descriptions mapping (from frontend types)
    MARKET_INTEREST_DESCRIPTIONS = {
        'global_politics': 'Global politics',
        'trade': 'Trade',
        'stocks': 'Stocks',
        'bonds': 'Bonds',
        'economy': 'Economy',
        'technology': 'Technology',
        'healthcare': 'Healthcare',
        'utilities': 'Utilities',
        'materials': 'Materials',
        'consumer_staples': 'Consumer staples',
        'consumer_discretionary': 'Consumer discretionary',
        'industrials': 'Industrials',
        'communication_services': 'Communication services',
        'energy': 'Energy',
        'financials': 'Financials',
        'real_estate': 'Real estate'
    }
    
    @staticmethod
    def get_user_personalization_context(user_id: str) -> PersonalizationContext:
        """
        Fetch and structure personalization context for a user.
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            PersonalizationContext: Structured context data
            
        Raises:
            Exception: Re-raises database errors for proper error handling
        """
        if not user_id:
            logger.warning("Empty user_id provided to get_user_personalization_context")
            return PersonalizationContext()
        
        try:
            supabase = get_supabase_client()
            
            # Fetch from user_personalization table
            response = supabase.table('user_personalization')\
                .select('*')\
                .eq('user_id', user_id)\
                .execute()
            
            if not response.data or len(response.data) == 0:
                logger.info(f"No personalization data found for user {user_id}")
                return PersonalizationContext()
            
            # Use the first record (should be unique by user_id)
            data = response.data[0]
            return PersonalizationService._format_personalization_context(data)
            
        except Exception as e:
            logger.error(f"Error fetching personalization for user {user_id}: {e}")
            # Re-raise for proper error handling by caller
            raise
    
    @staticmethod
    def _format_personalization_context(data: Dict[str, Any]) -> PersonalizationContext:
        """
        Format raw DB data into structured context.
        
        Args:
            data: Raw personalization data from database
            
        Returns:
            PersonalizationContext: Formatted context object
        """
        context = PersonalizationContext()
        
        # User name (sanitized for security)
        if data.get('first_name'):
            context.user_name = PersonalizationService._sanitize_name(data['first_name'])
        
        # Investment goals with actionable guidance
        if data.get('investment_goals'):
            goals_list = data['investment_goals']
            if isinstance(goals_list, list) and goals_list:
                # Map goal keys to descriptions
                goal_descriptions = []
                for goal in goals_list:
                    desc = PersonalizationService.INVESTMENT_GOAL_DESCRIPTIONS.get(goal, goal)
                    goal_descriptions.append(desc)
                
                context.investment_goals = (
                    f"User's investment goals: {', '.join(goal_descriptions)}. "
                    f"Tailor all recommendations to help achieve these specific objectives."
                )
        
        # Risk tolerance with strategy guidance
        if data.get('risk_tolerance'):
            risk_level = data['risk_tolerance']
            context.risk_tolerance_guidance = PersonalizationService._get_risk_guidance(risk_level)
        
        # Investment timeline with time-based strategy
        if data.get('investment_timeline'):
            timeline = data['investment_timeline']
            context.timeline_guidance = PersonalizationService._get_timeline_guidance(timeline)
        
        # Experience level with communication style
        if data.get('experience_level'):
            experience = data['experience_level']
            context.experience_guidance = PersonalizationService._get_experience_guidance(experience)
        
        # Monthly investment budget
        if data.get('monthly_investment_goal'):
            amount = data['monthly_investment_goal']
            if isinstance(amount, (int, float)) and amount > 0:
                context.monthly_budget_guidance = (
                    f"User's comfortable monthly investment amount: ${amount}. "
                    f"Keep this budget in mind when making investment recommendations."
                )
        
        # Market interests
        if data.get('market_interests'):
            interests = data['market_interests']
            if isinstance(interests, list) and interests:
                # Map interest keys to descriptions
                interest_descriptions = []
                for interest in interests:
                    desc = PersonalizationService.MARKET_INTEREST_DESCRIPTIONS.get(interest, interest)
                    interest_descriptions.append(desc)
                
                context.market_interests = (
                    f"User is particularly interested in: {', '.join(interest_descriptions)}. "
                    f"Reference relevant news and opportunities in these areas when appropriate."
                )
        
        return context
    
    @staticmethod
    def _sanitize_name(name: str) -> str:
        """
        Sanitize user name for safe system prompt injection.
        
        Implements security measures to prevent prompt injection attacks.
        
        Args:
            name: Raw user name from database
            
        Returns:
            str: Sanitized name safe for system prompt
        """
        if not name:
            return ""
        
        try:
            # Normalize Unicode to prevent homograph attacks
            import unicodedata
            normalized = unicodedata.normalize('NFKC', name)
            
            # Remove control characters and non-printable characters
            clean_chars = []
            for char in normalized:
                if char.isprintable() and char not in '\n\r\t\x0b\x0c':
                    clean_chars.append(char)
            
            sanitized = ''.join(clean_chars).strip()
            
            # Enforce length limit (consistent with validation rules)
            return sanitized[:50]
            
        except Exception as e:
            logger.warning(f"Error sanitizing name '{name}': {e}")
            return ""
    
    @staticmethod
    def _get_risk_guidance(risk_level: str) -> str:
        """Get investment strategy guidance based on risk tolerance."""
        guidance_map = {
            'conservative': (
                "User has conservative risk tolerance. Focus on capital preservation, "
                "bonds, blue-chip stocks, and diversified index funds. Emphasize steady growth and safety."
            ),
            'moderate': (
                "User has moderate risk tolerance. Recommend balanced portfolios with "
                "a mix of stocks and bonds. Focus on diversification and moderate growth potential."
            ),
            'aggressive': (
                "User has aggressive risk tolerance. They may be interested in growth stocks, "
                "emerging markets, and higher-risk/higher-reward opportunities. Emphasize potential for higher returns."
            )
        }
        return guidance_map.get(risk_level, "Provide balanced investment advice suitable for their risk profile.")
    
    @staticmethod
    def _get_timeline_guidance(timeline: str) -> str:
        """Get investment strategy based on timeline."""
        guidance_map = {
            'less_than_1_year': (
                "Short investment timeline (<1 year). Focus on liquid, low-risk investments "
                "like money market funds or short-term bonds due to the short timeline."
            ),
            '1_to_3_years': (
                "Short-medium timeline (1-3 years). Recommend moderately conservative investments "
                "with some growth potential but high liquidity."
            ),
            '3_to_5_years': (
                "Medium timeline (3-5 years). A balanced approach with moderate risk investments "
                "is appropriate for this medium-term timeline."
            ),
            '5_to_10_years': (
                "Long timeline (5-10 years). They can afford to take more risk for potentially "
                "higher returns with this longer timeline."
            ),
            '10_plus_years': (
                "Very long timeline (10+ years). Long-term growth strategies with higher risk "
                "tolerance are suitable. Focus on compound growth and market appreciation."
            )
        }
        return guidance_map.get(timeline, "Tailor investment advice to their specific time horizon.")
    
    @staticmethod
    def _get_experience_guidance(experience_level: str) -> str:
        """Get communication guidance based on experience level."""
        guidance_map = {
            'no_experience': (
                "User has no investment experience. Use simple, clear language and explain "
                "basic investment concepts. Focus on education and building confidence."
            ),
            'some_familiarity': (
                "User has some investment familiarity. Provide explanations for complex concepts "
                "while building on their basic knowledge."
            ),
            'comfortable': (
                "User is comfortable with investing. You can use more advanced investment "
                "terminology and discuss sophisticated strategies."
            ),
            'professional': (
                "User has professional investment experience. Use professional language and "
                "discuss advanced strategies, market analysis, and detailed financial concepts."
            )
        }
        return guidance_map.get(experience_level, "Adjust communication style to match their investment knowledge level.")
    
    @staticmethod
    def build_personalized_system_prompt(base_prompt: str, config: RunnableConfig = None) -> str:
        """
        Build system prompt with user personalization context injected.
        
        This is the main entry point for personalization integration.
        It safely fetches user context and enhances the system prompt.
        
        Args:
            base_prompt: The base system prompt
            config: LangGraph RunnableConfig containing user context
            
        Returns:
            str: Enhanced system prompt with personalization context
        """
        try:
            # Extract user_id from LangGraph config
            if not config:
                try:
                    config = get_config()
                except Exception as e:
                    logger.debug(f"No LangGraph config available: {e}")
                    return base_prompt
            
            if not config or not isinstance(config.get('configurable'), dict):
                logger.debug("No valid LangGraph config available for personalization")
                return base_prompt
            
            user_id = config['configurable'].get('user_id')
            if not user_id:
                logger.debug("No user_id in LangGraph config")
                return base_prompt
            
            # Fetch personalization context
            context = PersonalizationService.get_user_personalization_context(user_id)
            
            # If no personalization data, return base prompt
            if not context.has_any_context():
                logger.debug(f"No personalization context available for user {user_id}")
                return base_prompt
            
            # Build enhanced prompt
            personalization_sections = context.to_prompt_sections()
            personalization_context = "\n".join(personalization_sections)
            
            enhanced_prompt = f"""{base_prompt}

USER PERSONALIZATION CONTEXT:
{personalization_context}

Use this personalization information to tailor your responses, but don't explicitly mention that you have this context unless relevant to the conversation. Provide advice that aligns with their goals, risk tolerance, timeline, and experience level."""
            
            logger.info(f"Enhanced system prompt with personalization for user {user_id}")
            return enhanced_prompt
            
        except Exception as e:
            logger.error(f"Error building personalized system prompt: {e}")
            # Graceful fallback - never break the system
            return base_prompt


# Convenience function for use in graph.py
def create_personalized_supervisor_prompt(state, config: RunnableConfig = None):
    """
    Create supervisor prompt with user personalization context.
    
    This function will be called by the supervisor in graph.py.
    LangGraph expects prompt functions to return List[AnyMessage], not str!
    
    Args:
        state: The current graph state (StateSchema)
        config: LangGraph RunnableConfig containing user context
        
    Returns:
        List[AnyMessage]: List of messages with personalized system prompt
    """
    from langchain_core.messages import SystemMessage, AnyMessage
    from typing import List
    
    # Import from neutral location to avoid circular imports
    from utils.prompts.supervisor_prompt import get_supervisor_clera_system_prompt
    
    # Build the personalized system prompt with fresh timestamp
    base_prompt = get_supervisor_clera_system_prompt()
    personalized_prompt = PersonalizationService.build_personalized_system_prompt(
        base_prompt, 
        config=config
    )
    
    # Create the message list that LangGraph expects
    messages: List[AnyMessage] = []
    
    # Add the personalized system message
    messages.append(SystemMessage(content=personalized_prompt))
    
    # Add existing messages from state
    if hasattr(state, 'messages'):
        messages.extend(state.messages)
    elif isinstance(state, dict) and 'messages' in state:
        messages.extend(state['messages'])
    
    return messages
