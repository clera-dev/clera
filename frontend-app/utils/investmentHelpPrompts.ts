/**
 * Investment Help Prompt Generation System
 * Generates personalized prompts based on user context and portfolio status
 */

export interface PromptContext {
  firstName?: string;
  riskTolerance?: string;
  investmentGoals?: string[];
  hasPositions?: boolean;
  portfolioValue?: number;
  currentSymbol?: string;
  experienceLevel?: string;
}

/**
 * Generates a personalized prompt for new users based on their profile
 */
export function generatePersonalizedPrompt(
  firstName: string, 
  riskTolerance?: string
): string {
  // Clera already knows user's name and risk tolerance from system prompt
  // Focus on direct, actionable request that leverages her capabilities
  return "Can you walk me through how to get started with investing and help me find some good first investment opportunities?";
}

/**
 * Generates contextual prompts based on user's current situation
 */
export function generateContextualPrompt(context: PromptContext): string {
  const { hasPositions, currentSymbol, experienceLevel } = context;
  
  // Stock-specific analysis prompt
  if (currentSymbol) {
    return `I'm researching ${currentSymbol}. Can you analyze this company and tell me if it's a good fit for my portfolio?`;
  }
  
  // Portfolio optimization for existing investors
  if (hasPositions) {
    const experienceNote = experienceLevel === 'no_experience' || experienceLevel === 'some_familiarity' 
      ? "I'm still learning, so please keep it simple. "
      : "";
    
    return `${experienceNote}I want to add to my existing portfolio. Can you suggest some investments that would complement what I already own?`;
  }
  
  // General investment guidance
  return "I want to invest. Can you help me understand how to get started and recommend some good opportunities for me?";
}

/**
 * Generates prompts for specific investment scenarios
 */
export function generateScenarioPrompt(scenario: string, context: PromptContext): string {
  // Use a null-prototype record to avoid inheriting Object prototype properties
  const scenarios: Record<string, string> = Object.assign(Object.create(null), {
    first_investment: `I'm ready to make my first investment but want to make sure I'm making a smart choice. Can you help me understand how to research my first stock purchase and what factors I should consider?`,
    
    diversification: `I want to diversify my portfolio but I'm not sure how to go about it. Can you help me understand different investment types and how to build a balanced portfolio?`,
    
    market_volatility: `The market seems volatile right now. Can you help me understand how to invest during uncertain times and what strategies work best?`,
    
    sector_analysis: `I'm interested in learning about different market sectors. Can you help me understand how to research and compare different industries for investment opportunities?`,
    
    risk_assessment: `I want to better understand investment risk. Can you help me evaluate the risk levels of different investments and how they might fit my goals?`
  });

  if (Object.prototype.hasOwnProperty.call(scenarios, scenario)) {
    const value = scenarios[scenario];
    if (typeof value === 'string') return value;
  }
  return generateContextualPrompt(context);
}

/**
 * Generates prompts based on user's investment timeline
 */
export function generateTimelinePrompt(timeline: string, context: PromptContext): string {
  // Use a null-prototype record to avoid inheriting Object prototype properties
  const timelinePrompts: Record<string, string> = Object.assign(Object.create(null), {
    'less_than_1_year': 'I need to invest for a short-term goal (less than a year). Can you help me understand what types of investments are appropriate for short time horizons?',
    '1_to_3_years': 'I\'m investing for a medium-term goal (1-3 years). What investment strategies and types of stocks should I consider for this timeframe?',
    '3_to_5_years': 'I have a 3-5 year investment timeline. Can you help me build a strategy that balances growth potential with reasonable risk?',
    '5_to_10_years': 'I\'m investing for the long term (5-10 years). What growth strategies and investment approaches should I consider?',
    '10_plus_years': 'I\'m investing for retirement or very long-term goals (10+ years). Can you help me understand long-term wealth building strategies?'
  });

  if (Object.prototype.hasOwnProperty.call(timelinePrompts, timeline)) {
    const value = timelinePrompts[timeline];
    if (typeof value === 'string') return value;
  }
  return generateContextualPrompt(context);
}

/**
 * Prompts for users who have taken specific actions
 */
export function generateActionBasedPrompt(action: string, symbol?: string): string {
  // Use a null-prototype record to avoid inheriting Object prototype properties
  const actionPrompts: Record<string, string> = Object.assign(Object.create(null), {
    added_to_watchlist: symbol 
      ? `I just added ${symbol} to my watchlist. Can you help me research this company and understand if it might be a good investment for me?`
      : 'I\'ve been adding stocks to my watchlist. Can you help me analyze these companies and determine which ones might be good investment opportunities?',
    
    viewed_research: symbol
      ? `I've been looking at research for ${symbol}. Can you help me understand how to interpret this information and decide if I should invest?`
      : 'I\'ve been reading investment research but I\'m not sure how to use it to make decisions. Can you guide me through the process?',
    
    first_time_visitor: 'I\'m new to this platform and feeling a bit overwhelmed by all the investment options. Can you help me understand how to get started with research and finding good investment opportunities?'
  });

  if (Object.prototype.hasOwnProperty.call(actionPrompts, action)) {
    const value = actionPrompts[action];
    if (typeof value === 'string') return value;
  }
  return 'Can you help me understand how to research and evaluate investment opportunities?';
}

/**
 * Emergency fallback prompt when personalization fails
 */
export function getFallbackPrompt(): string {
  return "I'm looking for help with investment research and would like to understand your approach to evaluating stocks and building a portfolio. Can you guide me through the process?";
}

/**
 * Validates and sanitizes prompt context
 */
export function sanitizePromptContext(context: Partial<PromptContext>): PromptContext {
  return {
    firstName: context.firstName?.trim() || undefined,
    riskTolerance: context.riskTolerance || undefined,
    investmentGoals: Array.isArray(context.investmentGoals) ? context.investmentGoals : undefined,
    hasPositions: typeof context.hasPositions === 'boolean' ? context.hasPositions : undefined,
    portfolioValue: Number.isFinite(context.portfolioValue as number) ? (context.portfolioValue as number) : undefined,
    currentSymbol: context.currentSymbol?.trim()?.toUpperCase() || undefined,
    experienceLevel: context.experienceLevel || undefined,
  };
}
