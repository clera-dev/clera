/**
 * TypeScript type definitions for Weekly Stock Picks system
 * Following the established patterns from the investment research types
 */

export interface WeeklyStockPick {
  ticker: string;
  company_name: string;
  rationale: string;
  risk_level: 'low' | 'medium' | 'high'; // Required field in actual data
}

export interface WeeklyInvestmentTheme {
  title: string;
  summary: string;
  report: string;
  relevant_tickers: string[];
  theme_category: string; // Required field in actual data
}

export interface WeeklyMarketAnalysis {
  current_environment: string;
  risk_factors: string;
  opportunities: string;
}

export interface WeeklyStockPicksData {
  stock_picks: WeeklyStockPick[];
  investment_themes: WeeklyInvestmentTheme[];
  market_analysis: WeeklyMarketAnalysis;
  citations?: string[]; // Research sources from Perplexity Deep Research
}

export type ProcessingStatus = 'pending' | 'started' | 'processing' | 'sent_to_perplexity' | 'parsing_response' | 'complete' | 'error';

export interface WeeklyStockPicksRecord {
  id: string;
  user_id: string;
  stock_picks: WeeklyStockPick[];
  investment_themes: WeeklyInvestmentTheme[];
  market_analysis?: WeeklyMarketAnalysis;
  citations?: string[]; // Research sources from Perplexity Deep Research
  raw_response?: string; // Raw Perplexity API response for debugging
  status?: ProcessingStatus; // Track deep research processing status
  generated_at: string;
  week_of: string; // ISO date string for Monday of the week
  model?: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklyStockPicksResponse {
  success: boolean;
  data?: WeeklyStockPicksData | null; // Allow null for new user state
  metadata?: {
    generated_at: string | null; // Allow null for new user state
    week_of: string;
    cached?: boolean;
    fallback_reason?: string;
    generation_reason?: string; // Reason for triggering generation
    user_profile_used?: any;
    status?: ProcessingStatus; // Current processing status
  };
  error?: string;
}

// Utility type for database operations
export type WeeklyStockPicksInsert = Omit<WeeklyStockPicksRecord, 'id' | 'created_at' | 'updated_at'>;
export type WeeklyStockPicksUpdate = Partial<WeeklyStockPicksInsert>;

// Helper interfaces for the generation process
export interface StockPickGenerationContext {
  userId: string;
  userGoals: string;
  riskTolerance: string;
  investmentTimeline: string;
  monthlyBudget: number;
  marketInterests: string[];
  financialLiteracy: string;
  portfolioString: string;
  personalizationData: any;
}

export interface PerplexityStockPicksRequest {
  model: 'sonar-deep-research';
  messages: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      schema: any;
    };
  };
  max_tokens?: number;
}

export interface PerplexityStockPicksResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
  model?: string;
}
