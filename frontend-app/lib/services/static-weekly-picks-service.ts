/**
 * TEMPORARY STATIC WEEKLY PICKS SERVICE
 * 
 * This service provides static weekly stock picks data to all users during
 * the cost-optimization phase. It replaces the expensive Perplexity Deep Research
 * generation system with a single static dataset.
 * 
 * WHEN TO REMOVE:
 * - When ready to re-enable personalized Perplexity generation
 * - Remove this file entirely
 * - Restore the original API route logic
 * - Re-enable the cron job in vercel.json
 * 
 * @see lib/data/static-weekly-picks-fallback.json - The static data source
 * @see app/api/investment/weekly-picks/route.ts - Where this service is used
 */

import { WeeklyStockPicksData, WeeklyStockPick, WeeklyInvestmentTheme, WeeklyMarketAnalysis } from '@/lib/types/weekly-stock-picks';
import { getPacificMondayOfWeek } from '@/lib/timezone';
import staticFallbackData from '@/lib/data/static-weekly-picks-fallback.json';

export interface StaticWeeklyPicksData extends WeeklyStockPicksData {
  generated_at: string;
  week_of: string;
  model: string;
  citations: string[];
}

/**
 * Loads static weekly picks data for all users
 * 
 * This replaces the expensive personalized generation with a single
 * high-quality dataset that gives users a preview of the feature.
 * 
 * @returns Promise resolving to static weekly picks data
 */
export async function loadStaticWeeklyPicks(): Promise<StaticWeeklyPicksData> {
  // Simulate a small delay to mimic database response time
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Get current week (Pacific Monday) for consistent week_of across the app
  const currentWeek = getPacificMondayOfWeek(new Date());

  // Normalize and strongly type the static data so it matches our union types
  const normalizedStockPicks: WeeklyStockPick[] = (staticFallbackData.data.stock_picks || []).map((pick: any) => ({
    ticker: String(pick.ticker),
    company_name: String(pick.company_name),
    rationale: String(pick.rationale),
    risk_level: normalizeRiskLevel(pick.risk_level)
  }));

  const normalizedThemes: WeeklyInvestmentTheme[] = (staticFallbackData.data.investment_themes || []).map((theme: any) => ({
    title: String(theme.title),
    summary: String(theme.summary),
    report: String(theme.report),
    theme_category: String(theme.theme_category),
    relevant_tickers: Array.isArray(theme.relevant_tickers) ? theme.relevant_tickers.map((t: any) => String(t)) : []
  }));

  const normalizedMarket: WeeklyMarketAnalysis = {
    current_environment: String(staticFallbackData.data.market_analysis?.current_environment || ''),
    risk_factors: String(staticFallbackData.data.market_analysis?.risk_factors || ''),
    opportunities: String(staticFallbackData.data.market_analysis?.opportunities || '')
  };

  return {
    stock_picks: normalizedStockPicks,
    investment_themes: normalizedThemes,
    market_analysis: normalizedMarket,
    citations: Array.isArray(staticFallbackData.data.citations) ? staticFallbackData.data.citations.map((c: any) => String(c)) : [],
    generated_at: new Date().toISOString(),
    week_of: currentWeek,
    model: 'static-fallback'
  };
}

/**
 * Gets the week_of string for a given date using DST-safe Pacific timezone
 * Format: YYYY-MM-DD (Monday of the week)
 * 
 * This matches the getMondayOfWeek() helper in the API route to ensure
 * consistency across timezone boundaries and DST transitions.
 */
// PT helper centralized in lib/timezone.ts (getPacificMondayOfWeek)

/**
 * Metadata about the static fallback system
 */
export const STATIC_FALLBACK_METADATA = {
  reason: 'cost_optimization',
  description: 'Using static data during cost optimization phase',
  original_generation_date: staticFallbackData._metadata.original_generated_at,
  note: 'This is temporary - will be replaced with personalized data once enabled'
};

function normalizeRiskLevel(value: any): 'low' | 'medium' | 'high' {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  // Default to medium if unknown
  return 'medium';
}

