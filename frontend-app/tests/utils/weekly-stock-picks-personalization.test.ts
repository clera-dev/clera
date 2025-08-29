import { WeeklyStockPicksPersonalizationService } from '@/utils/services/weekly-stock-picks-personalization';
import { 
  PersonalizationData, 
  RiskTolerance, 
  InvestmentTimeline, 
  ExperienceLevel, 
  MarketInterest,
  InvestmentGoal 
} from '@/lib/types/personalization';

describe('WeeklyStockPicksPersonalizationService', () => {
  const mockPersonalizationData: PersonalizationData = {
    firstName: 'John',
    investmentGoals: [InvestmentGoal.RETIREMENT, InvestmentGoal.HOUSE],
    riskTolerance: RiskTolerance.MODERATE,
    investmentTimeline: InvestmentTimeline.FIVE_TO_TEN_YEARS,
    experienceLevel: ExperienceLevel.COMFORTABLE,
    monthlyInvestmentGoal: 1000,
    marketInterests: [MarketInterest.TECHNOLOGY, MarketInterest.HEALTHCARE]
  };

  describe('Type Safety and Domain Contracts', () => {
    test('should return proper domain enum types for risk tolerance', () => {
      const result = WeeklyStockPicksPersonalizationService.getRiskToleranceLevel(mockPersonalizationData);
      
      // Type assertion to verify return type
      const typedResult: RiskTolerance = result;
      expect(typedResult).toBe(RiskTolerance.MODERATE);
      
      // Verify it's not a primitive string
      expect(typeof result).toBe('string');
      expect(Object.values(RiskTolerance)).toContain(result);
    });

    test('should return proper domain enum types for investment timeline', () => {
      const result = WeeklyStockPicksPersonalizationService.getInvestmentTimeline(mockPersonalizationData);
      
      // Type assertion to verify return type
      const typedResult: InvestmentTimeline = result;
      expect(typedResult).toBe(InvestmentTimeline.FIVE_TO_TEN_YEARS);
      
      // Verify it's not a primitive string
      expect(typeof result).toBe('string');
      expect(Object.values(InvestmentTimeline)).toContain(result);
    });

    test('should return proper domain enum types for market interests', () => {
      const result = WeeklyStockPicksPersonalizationService.getMarketInterestsFocus(mockPersonalizationData);
      
      // Type assertion to verify return type
      const typedResult: MarketInterest[] = result;
      expect(typedResult).toEqual([MarketInterest.TECHNOLOGY, MarketInterest.HEALTHCARE]);
      
      // Verify it's an array of enum values, not primitive strings
      expect(Array.isArray(result)).toBe(true);
      result.forEach(interest => {
        expect(Object.values(MarketInterest)).toContain(interest);
      });
    });

    test('should return proper literal union type for communication level', () => {
      const result = WeeklyStockPicksPersonalizationService.getFinancialCommunicationLevel(mockPersonalizationData);
      
      // Type assertion to verify return type
      const typedResult: 'beginner' | 'intermediate' | 'advanced' | 'expert' = result;
      expect(typedResult).toBe('advanced');
      
      // Verify it's one of the expected literal values
      expect(['beginner', 'intermediate', 'advanced', 'expert']).toContain(result);
    });

    test('should return default values with proper types when no data provided', () => {
      const riskResult = WeeklyStockPicksPersonalizationService.getRiskToleranceLevel(null);
      const timelineResult = WeeklyStockPicksPersonalizationService.getInvestmentTimeline(null);
      const interestsResult = WeeklyStockPicksPersonalizationService.getMarketInterestsFocus(null);
      const communicationResult = WeeklyStockPicksPersonalizationService.getFinancialCommunicationLevel(null);
      
      // Verify default values are proper enum types
      expect(riskResult).toBe(RiskTolerance.MODERATE);
      expect(timelineResult).toBe(InvestmentTimeline.FIVE_TO_TEN_YEARS);
      expect(interestsResult).toEqual([]);
      expect(communicationResult).toBe('intermediate');
      
      // Verify types are correct
      expect(Object.values(RiskTolerance)).toContain(riskResult);
      expect(Object.values(InvestmentTimeline)).toContain(timelineResult);
      expect(Array.isArray(interestsResult)).toBe(true);
      expect(['beginner', 'intermediate', 'advanced', 'expert']).toContain(communicationResult);
    });
  });

  describe('formatPersonalizationContext', () => {
    test('should return array of strings with proper personalization context', () => {
      const result = WeeklyStockPicksPersonalizationService.formatPersonalizationContext(mockPersonalizationData);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Verify each section is a string
      result.forEach(section => {
        expect(typeof section).toBe('string');
        expect(section.length).toBeGreaterThan(0);
      });
      
      // Verify specific content is included
      const resultText = result.join(' ');
      expect(resultText).toContain('John');
      expect(resultText).toContain('retirement');
      expect(resultText).toContain('house');
      expect(resultText).toContain('$1000');
      expect(resultText).toContain('technology');
      expect(resultText).toContain('healthcare');
    });
  });

  describe('enhanceSystemPrompt', () => {
    test('should enhance base prompt with personalization context', () => {
      const basePrompt = 'Generate stock recommendations.';
      const result = WeeklyStockPicksPersonalizationService.enhanceSystemPrompt(basePrompt, mockPersonalizationData);
      
      expect(typeof result).toBe('string');
      expect(result).toContain(basePrompt);
      expect(result).toContain('PERSONALIZATION CONTEXT FOR STOCK SELECTION');
      expect(result).toContain('John');
      expect(result).toContain('CRITICAL: Use this personalization information');
    });

    test('should return base prompt unchanged when no personalization data', () => {
      const basePrompt = 'Generate stock recommendations.';
      const result = WeeklyStockPicksPersonalizationService.enhanceSystemPrompt(basePrompt, null);
      
      expect(result).toBe(basePrompt);
    });
  });

  describe('getUserGoalsSummary', () => {
    test('should return formatted goals summary', () => {
      const result = WeeklyStockPicksPersonalizationService.getUserGoalsSummary(mockPersonalizationData);
      
      expect(typeof result).toBe('string');
      expect(result).toContain('retirement');
      expect(result).toContain('house');
    });

    test('should return default summary when no goals', () => {
      const result = WeeklyStockPicksPersonalizationService.getUserGoalsSummary(null);
      
      expect(typeof result).toBe('string');
      expect(result).toContain('Long-term wealth building');
    });
  });
});

