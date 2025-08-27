import { 
  PersonalizationData,
  INVESTMENT_GOAL_DESCRIPTIONS,
  RISK_TOLERANCE_DESCRIPTIONS,
  INVESTMENT_TIMELINE_DESCRIPTIONS,
  EXPERIENCE_LEVEL_DESCRIPTIONS,
  MARKET_INTEREST_DESCRIPTIONS
} from "@/lib/types/personalization";

/**
 * Service for creating personalized system prompts for weekly stock picks generation.
 * Follows SOLID principles and mirrors NewsPersonalizationService patterns.
 */
export class WeeklyStockPicksPersonalizationService {
  
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
   * Get investment strategy guidance based on risk tolerance for stock picks
   */
  private static getRiskBasedStockGuidance(riskLevel: string): string {
    const guidanceMap: Record<string, string> = {
      'conservative': (
        "Focus on large-cap, dividend-paying stocks with strong balance sheets and stable earnings. " +
        "Emphasize blue-chip companies, utilities, and defensive sectors. Avoid speculative growth stocks."
      ),
      'moderate': (
        "Recommend a balanced mix of growth and value stocks across different market caps. " +
        "Include some dividend stocks and growth companies with proven track records. Moderate risk exposure."
      ),
      'aggressive': (
        "Focus on high-growth potential stocks, emerging markets, small-cap opportunities, and disruptive technologies. " +
        "Include momentum stocks and companies with significant upside potential despite higher volatility."
      )
    };
    return guidanceMap[riskLevel] || "Provide balanced stock recommendations suitable for their risk profile.";
  }
  
  /**
   * Get investment strategy based on timeline for stock picks
   */
  private static getTimelineBasedStockGuidance(timeline: string): string {
    const guidanceMap: Record<string, string> = {
      'less_than_1_year': (
        "Focus on stable, liquid large-cap stocks with minimal volatility. " +
        "Avoid high-growth speculative plays due to short timeline."
      ),
      '1_to_3_years': (
        "Recommend quality stocks with moderate growth potential and reasonable valuations. " +
        "Balance between stability and growth for medium-term gains."
      ),
      '3_to_5_years': (
        "Include growth stocks with strong fundamentals and expansion plans. " +
        "Mix of established companies and emerging leaders in their sectors."
      ),
      '5_to_10_years': (
        "Focus on long-term growth opportunities, including innovative companies and disruptive technologies. " +
        "Higher risk tolerance allows for more aggressive growth picks."
      ),
      '10_plus_years': (
        "Emphasize transformative companies and long-term megatrends. " +
        "Include emerging technologies, demographic shifts, and paradigm-changing businesses."
      )
    };
    return guidanceMap[timeline] || "Tailor stock recommendations to their specific time horizon.";
  }
  
  /**
   * Get communication style guidance based on experience level
   */
  private static getExperienceBasedCommunication(experienceLevel: string): string {
    const guidanceMap: Record<string, string> = {
      'no_experience': (
        "Use simple, clear explanations for stock recommendations. Explain why each stock is suitable " +
        "for beginners and include basic investment concepts in your rationale."
      ),
      'some_familiarity': (
        "Provide clear explanations while building on basic investment knowledge. " +
        "Include some financial metrics but explain their significance."
      ),
      'comfortable': (
        "Use standard investment terminology and discuss financial metrics, competitive positioning, " +
        "and market dynamics in your stock analysis."
      ),
      'professional': (
        "Use sophisticated financial analysis, discuss valuation models, competitive moats, " +
        "and detailed market dynamics. Include professional-level insights."
      )
    };
    return guidanceMap[experienceLevel] || "Adjust communication style to match their investment knowledge level.";
  }
  
  /**
   * Get sector focus guidance based on market interests
   */
  private static getSectorFocusGuidance(marketInterests: string[]): string {
    if (!marketInterests || marketInterests.length === 0) {
      return "Provide diversified stock picks across multiple sectors.";
    }
    
    const sectorMappings: Record<string, string> = {
      'technology': 'software, semiconductors, cloud computing, AI, and cybersecurity',
      'healthcare': 'pharmaceuticals, biotechnology, medical devices, and healthcare services',
      'financials': 'banks, insurance, fintech, payment processors, and asset management',
      'energy': 'renewable energy, oil & gas, utilities, and energy infrastructure',
      'consumer_discretionary': 'retail, automotive, entertainment, and luxury goods',
      'consumer_staples': 'food & beverage, household products, and personal care',
      'industrials': 'aerospace, manufacturing, logistics, and industrial equipment',
      'materials': 'mining, chemicals, construction materials, and commodity producers',
      'real_estate': 'REITs, real estate development, and property management',
      'communication_services': 'telecommunications, media, and social media platforms',
      'utility': 'electric utilities, water utilities, and renewable energy infrastructure'
    };
    
    const focusAreas = marketInterests
      .map(interest => sectorMappings[interest])
      .filter(Boolean);
    
    if (focusAreas.length > 0) {
      return `Focus primarily on stocks in these sectors: ${focusAreas.join(', ')}. ` +
             `Ensure at least 60% of stock picks align with these interests while maintaining some diversification.`;
    }
    
    return "Provide diversified stock picks across multiple sectors.";
  }
  
  /**
   * Formats personalization data into comprehensive prompt context
   */
  static formatPersonalizationContext(data: PersonalizationData): string[] {
    const sections: string[] = [];
    
    // User name for personalization
    if (data.firstName) {
      const safeName = this.sanitizeUserName(data.firstName);
      if (safeName) {
        sections.push(`The user's name is ${safeName}.`);
      }
    }
    
    // Investment goals with specific stock selection guidance
    if (data.investmentGoals && data.investmentGoals.length > 0) {
      const goalDescriptions = data.investmentGoals.map(goal => 
        INVESTMENT_GOAL_DESCRIPTIONS[goal] || goal
      );
      
      sections.push(
        `User's investment goals: ${goalDescriptions.join(', ')}. ` +
        `Select stocks that specifically support these objectives and explain how each pick aligns with their goals.`
      );
    }
    
    // Risk tolerance with stock selection strategy
    if (data.riskTolerance) {
      sections.push(this.getRiskBasedStockGuidance(data.riskTolerance));
    }
    
    // Investment timeline with time-appropriate stock strategy
    if (data.investmentTimeline) {
      sections.push(this.getTimelineBasedStockGuidance(data.investmentTimeline));
    }
    
    // Experience level with communication guidance
    if (data.experienceLevel) {
      sections.push(this.getExperienceBasedCommunication(data.experienceLevel));
    }
    
    // Monthly investment budget context
    if (data.monthlyInvestmentGoal && data.monthlyInvestmentGoal > 0) {
      sections.push(
        `User's monthly investment budget: $${data.monthlyInvestmentGoal}. ` +
        `Consider stock prices and recommend positions that are accessible within this budget constraint.`
      );
    }
    
    // Market interests for sector focus
    if (data.marketInterests && data.marketInterests.length > 0) {
      sections.push(this.getSectorFocusGuidance(data.marketInterests));
    }
    
    return sections;
  }
  
  /**
   * Enhances a base system prompt with personalization context for stock picks
   */
  static enhanceSystemPrompt(basePrompt: string, data: PersonalizationData | null): string {
    if (!data) {
      return basePrompt;
    }
    
    const personalizationSections = this.formatPersonalizationContext(data);
    
    if (personalizationSections.length === 0) {
      return basePrompt;
    }
    
    const personalizationContext = personalizationSections.join('\n\n');
    
    return `${basePrompt}

## PERSONALIZATION CONTEXT FOR STOCK SELECTION:

${personalizationContext}

CRITICAL: Use this personalization information to select stocks that specifically match the user's profile. Every stock recommendation must align with their goals, risk tolerance, timeline, and interests. Explain how each pick serves their specific situation.`;
  }
  
  /**
   * Extract user goals summary for stock pick context
   */
  static getUserGoalsSummary(data: PersonalizationData | null): string {
    if (!data || !data.investmentGoals || data.investmentGoals.length === 0) {
      return 'Long-term wealth building through diversified stock investments';
    }
    
    const goalDescriptions = data.investmentGoals.map(goal => 
      INVESTMENT_GOAL_DESCRIPTIONS[goal] || goal
    );
    
    return goalDescriptions.join(', ');
  }
  
  /**
   * Get user's risk tolerance for stock selection
   */
  static getRiskToleranceLevel(data: PersonalizationData | null): string {
    if (!data || !data.riskTolerance) {
      return 'moderate';
    }
    
    return data.riskTolerance;
  }
  
  /**
   * Get user's investment timeline for stock selection strategy
   */
  static getInvestmentTimeline(data: PersonalizationData | null): string {
    if (!data || !data.investmentTimeline) {
      return '5_to_10_years';
    }
    
    return data.investmentTimeline;
  }
  
  /**
   * Get user's sector interests for focused stock recommendations
   */
  static getMarketInterestsFocus(data: PersonalizationData | null): string[] {
    if (!data || !data.marketInterests || data.marketInterests.length === 0) {
      return [];
    }
    
    return data.marketInterests;
  }
  
  /**
   * Get appropriate financial communication level for stock explanations
   */
  static getFinancialCommunicationLevel(data: PersonalizationData | null): string {
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
