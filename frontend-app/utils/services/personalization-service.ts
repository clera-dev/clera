"use client";

import { 
  PersonalizationData,
  INVESTMENT_GOAL_DESCRIPTIONS,
  RISK_TOLERANCE_DESCRIPTIONS,
  INVESTMENT_TIMELINE_DESCRIPTIONS,
  EXPERIENCE_LEVEL_DESCRIPTIONS,
  MARKET_INTEREST_DESCRIPTIONS
} from "@/lib/types/personalization";
import { getPersonalizationData } from "@/utils/api/personalization-client";

/**
 * Service class for handling personalization context injection into AI conversations
 */
export class PersonalizationService {
  
  /**
   * Fetches and formats personalization context for a user
   */
  static async getPersonalizationContext(userId?: string): Promise<string> {
    try {
      // Fetch personalization data
      const personalizationData = await getPersonalizationData();
      
      if (!personalizationData) {
        // Return empty context if no personalization data exists
        return "";
      }
      
      // Format into natural language context
      return this.formatPersonalizationPrompt(personalizationData);
      
    } catch (error) {
      console.error('Error fetching personalization context:', error);
      return ""; // Return empty context on error - don't break the chat
    }
  }
  
  /**
   * Formats personalization data into a natural language prompt for the AI
   */
  static formatPersonalizationPrompt(data: PersonalizationData): string {
    const contextParts: string[] = [];
    
    // Add user's name for personalization
    if (data.firstName) {
      contextParts.push(`The user's name is ${data.firstName}.`);
    }
    
    // Add investment goals with context
    if (data.investmentGoals && data.investmentGoals.length > 0) {
      const goalDescriptions = data.investmentGoals
        .map(goal => INVESTMENT_GOAL_DESCRIPTIONS[goal])
        .join(', ');
      contextParts.push(
        `Their investment goals include: ${goalDescriptions}. Please tailor your investment advice and recommendations to help achieve these specific goals.`
      );
    }
    
    // Add risk tolerance with guidance
    if (data.riskTolerance) {
      const riskDescription = RISK_TOLERANCE_DESCRIPTIONS[data.riskTolerance];
      const riskGuidance = this.getRiskToleranceGuidance(data.riskTolerance);
      contextParts.push(
        `Their risk tolerance is ${data.riskTolerance} (${riskDescription}). ${riskGuidance}`
      );
    }
    
    // Add investment timeline with context
    if (data.investmentTimeline) {
      const timelineDescription = INVESTMENT_TIMELINE_DESCRIPTIONS[data.investmentTimeline];
      const timelineGuidance = this.getTimelineGuidance(data.investmentTimeline);
      contextParts.push(
        `Their investment timeline is ${timelineDescription}. ${timelineGuidance}`
      );
    }
    
    // Add experience level with appropriate communication style
    if (data.experienceLevel) {
      const experienceDescription = EXPERIENCE_LEVEL_DESCRIPTIONS[data.experienceLevel];
      const communicationGuidance = this.getExperienceGuidance(data.experienceLevel);
      contextParts.push(
        `Their investment experience level: ${experienceDescription}. ${communicationGuidance}`
      );
    }
    
    // Add monthly investment budget
    if (data.monthlyInvestmentGoal) {
      contextParts.push(
        `They are comfortable investing about $${data.monthlyInvestmentGoal} per month. Keep this budget in mind when making investment recommendations.`
      );
    }
    
    // Add market interests
    if (data.marketInterests && data.marketInterests.length > 0) {
      const interestDescriptions = data.marketInterests
        .map(interest => MARKET_INTEREST_DESCRIPTIONS[interest])
        .join(', ');
      contextParts.push(
        `They are particularly interested in these market sectors and topics: ${interestDescriptions}. Feel free to reference relevant news and opportunities in these areas.`
      );
    }
    
    // Combine all context with instructions
    if (contextParts.length === 0) {
      return "";
    }
    
    const contextString = contextParts.join(' ');
    
    return `
PERSONALIZATION CONTEXT:
${contextString}

Please use this information to personalize your responses, but don't explicitly mention that you have this context unless relevant to the conversation. Provide advice that aligns with their goals, risk tolerance, timeline, and experience level.
`;
  }
  
  /**
   * Provides guidance based on risk tolerance
   */
  private static getRiskToleranceGuidance(riskTolerance: string): string {
    switch (riskTolerance) {
      case 'conservative':
        return 'Focus on lower-risk investments like bonds, blue-chip stocks, and diversified index funds. Emphasize capital preservation and steady growth.';
      case 'moderate':
        return 'Recommend a balanced portfolio with a mix of stocks and bonds. Focus on diversification and moderate growth potential.';
      case 'aggressive':
        return 'They may be interested in growth stocks, emerging markets, and higher-risk/higher-reward opportunities. Emphasize potential for higher returns.';
      default:
        return 'Provide balanced investment advice suitable for their risk profile.';
    }
  }
  
  /**
   * Provides guidance based on investment timeline
   */
  private static getTimelineGuidance(timeline: string): string {
    switch (timeline) {
      case 'less_than_1_year':
        return 'Focus on liquid, low-risk investments like money market funds or short-term bonds due to the short timeline.';
      case '1_to_3_years':
        return 'Recommend moderately conservative investments with some growth potential but high liquidity.';
      case '3_to_5_years':
        return 'A balanced approach with moderate risk investments is appropriate for this medium-term timeline.';
      case '5_to_10_years':
        return 'They can afford to take more risk for potentially higher returns with this longer timeline.';
      case '10_plus_years':
        return 'Long-term growth strategies with higher risk tolerance are suitable. Focus on compound growth and market appreciation.';
      default:
        return 'Tailor investment advice to their specific time horizon.';
    }
  }
  
  /**
   * Provides communication guidance based on experience level
   */
  private static getExperienceGuidance(experienceLevel: string): string {
    switch (experienceLevel) {
      case 'no_experience':
        return 'Use simple, clear language and explain basic investment concepts. Focus on education and building confidence.';
      case 'some_familiarity':
        return 'Provide explanations for more complex concepts while building on their basic knowledge.';
      case 'comfortable':
        return 'You can use more advanced investment terminology and discuss sophisticated strategies.';
      case 'professional':
        return 'Use professional investment language and discuss advanced strategies, market analysis, and detailed financial concepts.';
      default:
        return 'Adjust your communication style to match their investment knowledge level.';
    }
  }
  
  /**
   * Enhances a user message with personalization context
   */
  static async enhanceMessageWithContext(userMessage: string, userId?: string): Promise<string> {
    const context = await this.getPersonalizationContext(userId);
    
    if (!context || context.trim() === "") {
      // No personalization data available, return original message
      return userMessage;
    }
    
    // Prepend context to the user message
    return `${context}\n\nUser Message: ${userMessage}`;
  }
  
  /**
   * Checks if personalization data exists for the current user
   */
  static async hasPersonalizationData(): Promise<boolean> {
    try {
      const data = await getPersonalizationData();
      return data !== null;
    } catch (error) {
      console.error('Error checking personalization data:', error);
      return false;
    }
  }
  
  /**
   * Gets a summary of user's personalization for display purposes
   */
  static async getPersonalizationSummary(): Promise<string | null> {
    try {
      const data = await getPersonalizationData();
      
      if (!data) {
        return null;
      }
      
      const summaryParts: string[] = [];
      
      if (data.firstName) {
        summaryParts.push(`Name: ${data.firstName}`);
      }
      
      if (data.investmentGoals && data.investmentGoals.length > 0) {
        const goals = data.investmentGoals
          .slice(0, 2) // Show first 2 goals
          .map(goal => INVESTMENT_GOAL_DESCRIPTIONS[goal])
          .join(', ');
        summaryParts.push(`Goals: ${goals}${data.investmentGoals.length > 2 ? '...' : ''}`);
      }
      
      if (data.riskTolerance) {
        summaryParts.push(`Risk: ${data.riskTolerance}`);
      }
      
      if (data.investmentTimeline) {
        summaryParts.push(`Timeline: ${INVESTMENT_TIMELINE_DESCRIPTIONS[data.investmentTimeline]}`);
      }
      
      return summaryParts.join(' • ');
      
    } catch (error) {
      console.error('Error getting personalization summary:', error);
      return null;
    }
  }
}
