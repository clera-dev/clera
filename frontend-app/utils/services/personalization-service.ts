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
   * Sanitizes user-provided text for safe inclusion in LLM system prompts.
   * - Normalizes Unicode
   * - Removes control characters and disallowed punctuation
   * - Allows letters (incl. accents), spaces, hyphens, and apostrophes
   * - Collapses whitespace and trims
   * - Enforces a conservative max length
   */
  private static sanitizeUserName(name: string): string {
    if (!name) return '';
    try {
      const normalized = name.normalize('NFKC');
      const withoutControls = normalized.replace(/[\u0000-\u001F\u007F]/g, '');
      // Allow letters (Latin incl. accents), spaces, hyphens, apostrophes only
      const whitelisted = withoutControls.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' \- ]/g, '');
      const collapsed = whitelisted.replace(/\s+/g, ' ').trim();
      // Enforce length guard consistent with validation rules
      return collapsed.slice(0, 50);
    } catch {
      return '';
    }
  }
  
  // NOTE: getPersonalizationContext removed - now handled by backend PersonalizationService
  
  // NOTE: formatPersonalizationPrompt removed - now handled by backend PersonalizationService
  
  // NOTE: getRiskToleranceGuidance removed - now handled by backend PersonalizationService
  
  // NOTE: getTimelineGuidance removed - now handled by backend PersonalizationService
  
  // NOTE: getExperienceGuidance removed - now handled by backend PersonalizationService
  
  // NOTE: enhanceMessageWithContext removed - personalization now handled by backend
  
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
        const safeName = this.sanitizeUserName(data.firstName);
        if (safeName) summaryParts.push(`Name: ${safeName}`);
      }
      
      if (data.investmentGoals && data.investmentGoals.length > 0) {
        const goals = data.investmentGoals
          .slice(0, 2) // Show first 2 goals
          .map(goal => INVESTMENT_GOAL_DESCRIPTIONS[goal])
          .join(', ');
        summaryParts.push(`Goals: ${goals}${data.investmentGoals.length > 2 ? '...' : ''}`);
      }
      
      if (data.riskTolerance) {
        const riskDescription = RISK_TOLERANCE_DESCRIPTIONS[data.riskTolerance] ?? String(data.riskTolerance);
        summaryParts.push(`Risk: ${riskDescription}`);
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
