import { 
  PersonalizationData,
  INVESTMENT_GOAL_DESCRIPTIONS,
  RISK_TOLERANCE_DESCRIPTIONS,
  INVESTMENT_TIMELINE_DESCRIPTIONS,
  EXPERIENCE_LEVEL_DESCRIPTIONS,
  MARKET_INTEREST_DESCRIPTIONS
} from "@/lib/types/personalization";

/**
 * Utility for creating personalized system prompts for news summary generation.
 * This mirrors the backend PersonalizationService but for frontend API routes.
 */
export class NewsPersonalizationService {
  
  /**
   * Sanitizes user name for safe system prompt injection
   */
  private static sanitizeUserName(name: string): string {
    if (!name) return '';
    try {
      // Normalize Unicode to prevent homograph attacks
      const normalized = name.normalize('NFKC');
      
      // Remove control characters and non-printable characters
      const cleanChars = [];
      for (const char of normalized) {
        // Allow letters, spaces, apostrophes, and hyphens only
        if (char.length > 0 && (/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(char) || char === ' ' || char === "'" || char === '-')) {
          cleanChars.push(char);
        }
      }
      
      const sanitized = cleanChars.join('').trim();
      
      // Enforce length limit (consistent with validation rules)
      return sanitized.slice(0, 50);
      
    } catch (error) {
      console.warn(`Error sanitizing name '${name}':`, error);
      return '';
    }
  }
  
  /**
   * Get investment strategy guidance based on risk tolerance
   */
  private static getRiskGuidance(riskLevel: string): string {
    const guidanceMap: Record<string, string> = {
      'conservative': (
        "User has conservative risk tolerance. Focus on capital preservation, " +
        "bonds, blue-chip stocks, and diversified index funds. Emphasize steady growth and safety."
      ),
      'moderate': (
        "User has moderate risk tolerance. Recommend balanced portfolios with " +
        "a mix of stocks and bonds. Focus on diversification and moderate growth potential."
      ),
      'aggressive': (
        "User has aggressive risk tolerance. They may be interested in growth stocks, " +
        "emerging markets, and higher-risk/higher-reward opportunities. Emphasize potential for higher returns."
      )
    };
    return guidanceMap[riskLevel] || "Provide balanced investment advice suitable for their risk profile.";
  }
  
  /**
   * Get investment strategy based on timeline
   */
  private static getTimelineGuidance(timeline: string): string {
    const guidanceMap: Record<string, string> = {
      'less_than_1_year': (
        "Short investment timeline (<1 year). Focus on liquid, low-risk investments " +
        "like money market funds or short-term bonds due to the short timeline."
      ),
      '1_to_3_years': (
        "Short-medium timeline (1-3 years). Recommend moderately conservative investments " +
        "with some growth potential but high liquidity."
      ),
      '3_to_5_years': (
        "Medium timeline (3-5 years). A balanced approach with moderate risk investments " +
        "is appropriate for this medium-term timeline."
      ),
      '5_to_10_years': (
        "Long timeline (5-10 years). They can afford to take more risk for potentially " +
        "higher returns with this longer timeline."
      ),
      '10_plus_years': (
        "Very long timeline (10+ years). Long-term growth strategies with higher risk " +
        "tolerance are suitable. Focus on compound growth and market appreciation."
      )
    };
    return guidanceMap[timeline] || "Tailor investment advice to their specific time horizon.";
  }
  
  /**
   * Get communication guidance based on experience level
   */
  private static getExperienceGuidance(experienceLevel: string): string {
    const guidanceMap: Record<string, string> = {
      'no_experience': (
        "User has no investment experience. Use simple, clear language and explain " +
        "basic investment concepts. Focus on education and building confidence."
      ),
      'some_familiarity': (
        "User has some investment familiarity. Provide explanations for complex concepts " +
        "while building on their basic knowledge."
      ),
      'comfortable': (
        "User is comfortable with investing. You can use more advanced investment " +
        "terminology and discuss sophisticated strategies."
      ),
      'professional': (
        "User has professional investment experience. Use professional language and " +
        "discuss advanced strategies, market analysis, and detailed financial concepts."
      )
    };
    return guidanceMap[experienceLevel] || "Adjust communication style to match their investment knowledge level.";
  }
  
  /**
   * Formats personalization data into prompt sections
   */
  static formatPersonalizationContext(data: PersonalizationData): string[] {
    const sections: string[] = [];
    
    // User name
    if (data.firstName) {
      const safeName = this.sanitizeUserName(data.firstName);
      if (safeName) {
        sections.push(`The user's name is ${safeName}.`);
      }
    }
    
    // Investment goals with actionable guidance
    if (data.investmentGoals && data.investmentGoals.length > 0) {
      const goalDescriptions = data.investmentGoals.map(goal => 
        INVESTMENT_GOAL_DESCRIPTIONS[goal] || goal
      );
      
      sections.push(
        `User's investment goals: ${goalDescriptions.join(', ')}. ` +
        `Tailor all recommendations to help achieve these specific objectives.`
      );
    }
    
    // Risk tolerance with strategy guidance
    if (data.riskTolerance) {
      sections.push(this.getRiskGuidance(data.riskTolerance));
    }
    
    // Investment timeline with time-based strategy
    if (data.investmentTimeline) {
      sections.push(this.getTimelineGuidance(data.investmentTimeline));
    }
    
    // Experience level with communication style
    if (data.experienceLevel) {
      sections.push(this.getExperienceGuidance(data.experienceLevel));
    }
    
    // Monthly investment budget
    if (data.monthlyInvestmentGoal && data.monthlyInvestmentGoal > 0) {
      sections.push(
        `User's comfortable monthly investment amount: $${data.monthlyInvestmentGoal}. ` +
        `Keep this budget in mind when making investment recommendations.`
      );
    }
    
    // Market interests
    if (data.marketInterests && data.marketInterests.length > 0) {
      const interestDescriptions = data.marketInterests.map(interest =>
        MARKET_INTEREST_DESCRIPTIONS[interest] || interest
      );
      
      sections.push(
        `User is particularly interested in: ${interestDescriptions.join(', ')}. ` +
        `Reference relevant news and opportunities in these areas when appropriate.`
      );
    }
    
    return sections;
  }
  
  /**
   * Enhances a base system prompt with personalization context
   */
  static enhanceSystemPrompt(basePrompt: string, data: PersonalizationData | null): string {
    if (!data) {
      return basePrompt;
    }
    
    const personalizationSections = this.formatPersonalizationContext(data);
    
    if (personalizationSections.length === 0) {
      return basePrompt;
    }
    
    const personalizationContext = personalizationSections.join('\n');
    
    return `${basePrompt}

USER PERSONALIZATION CONTEXT:
${personalizationContext}

Use this personalization information to tailor your responses, but don't explicitly mention that you have this context unless relevant to the conversation. Provide advice that aligns with their goals, risk tolerance, timeline, and experience level.`;
  }
  
  /**
   * Extract user goals summary for prompt variables
   */
  static getUserGoalsSummary(data: PersonalizationData | null): string {
    if (!data || !data.investmentGoals || data.investmentGoals.length === 0) {
      return 'Long-term growth, focus on diversified portfolio';
    }
    
    const goalDescriptions = data.investmentGoals.map(goal => 
      INVESTMENT_GOAL_DESCRIPTIONS[goal] || goal
    );
    
    return goalDescriptions.join(', ');
  }
  
  /**
   * Get appropriate financial literacy level for prompt
   */
  static getFinancialLiteracyLevel(data: PersonalizationData | null): string {
    if (!data || !data.experienceLevel) {
      return 'intermediate';
    }
    
    const levelMap: Record<string, string> = {
      'no_experience': 'beginner',
      'some_familiarity': 'intermediate',
      'comfortable': 'advanced',
      'professional': 'expert'
    };
    
    return levelMap[data.experienceLevel] || 'intermediate';
  }
}
