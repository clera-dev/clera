/**
 * Tests for Investment Help Prompt Generation
 * Verifies contextual prompts work correctly for different user scenarios
 */

import {
  generatePersonalizedPrompt,
  generateContextualPrompt,
  generateScenarioPrompt,
  generateTimelinePrompt,
  generateActionBasedPrompt,
  sanitizePromptContext,
  getFallbackPrompt,
  type PromptContext
} from '@/utils/investmentHelpPrompts';

describe('Investment Help Prompts', () => {
  describe('generatePersonalizedPrompt', () => {
    it('should generate direct, strategic prompt for new users', () => {
      const prompt = generatePersonalizedPrompt('John', 'conservative');
      expect(prompt).toContain('how to get started');
      expect(prompt).toContain('first investment');
      expect(prompt).toContain('opportunities');
    });

    it('should be consistent regardless of risk tolerance (Clera knows this)', () => {
      const conservativePrompt = generatePersonalizedPrompt('Sarah', 'conservative');
      const moderatePrompt = generatePersonalizedPrompt('Mike', 'moderate');
      const aggressivePrompt = generatePersonalizedPrompt('Lisa', 'aggressive');
      
      // All should be the same since Clera knows risk tolerance from system prompt
      expect(conservativePrompt).toBe(moderatePrompt);
      expect(moderatePrompt).toBe(aggressivePrompt);
    });

    it('should focus on action and opportunity finding', () => {
      const prompt = generatePersonalizedPrompt('Alex', 'unknown');
      expect(prompt).toContain('investment opportunities');
      expect(prompt).toContain('walk me through');
    });

    it('should be concise and direct', () => {
      const prompt = generatePersonalizedPrompt('Test', 'moderate');
      expect(prompt.length).toBeLessThan(200); // Much shorter than before
      expect(prompt).not.toContain('overwhelmed'); // No emotional language
    });
  });

  describe('generateContextualPrompt', () => {
    it('should generate stock-specific prompt when currentSymbol is provided', () => {
      const context: PromptContext = {
        firstName: 'Emma',
        currentSymbol: 'AAPL',
        hasPositions: true
      };
      
      const prompt = generateContextualPrompt(context);
      expect(prompt).toContain('AAPL');
      expect(prompt).toContain('researching');
      expect(prompt).toContain('analyze this company');
      expect(prompt).toContain('good fit for my portfolio');
    });

    it('should generate portfolio optimization prompt for existing investors', () => {
      const context: PromptContext = {
        firstName: 'David',
        hasPositions: true,
        experienceLevel: 'comfortable'
      };
      
      const prompt = generateContextualPrompt(context);
      expect(prompt).toContain('add to my existing portfolio');
      expect(prompt).toContain('complement what I already own');
    });

    it('should generate beginner-friendly prompt for inexperienced users', () => {
      const context: PromptContext = {
        firstName: 'Lisa',
        hasPositions: true,
        experienceLevel: 'no_experience'
      };
      
      const prompt = generateContextualPrompt(context);
      expect(prompt).toContain('add to my existing portfolio');
      expect(prompt).not.toContain('still learning');
      expect(prompt).not.toContain('keep it simple');
    });

    it('should generate general investment guidance for new investors', () => {
      const context: PromptContext = {
        firstName: 'Tom',
        hasPositions: false,
        riskTolerance: 'moderate'
      };
      
      const prompt = generateContextualPrompt(context);
      expect(prompt).toContain('I want to invest');
      expect(prompt).toContain('how to get started');
      expect(prompt).toContain('recommend');
      // No longer includes risk tolerance since Clera already knows it
    });
  });

  describe('generateScenarioPrompt', () => {
    it('should generate first investment scenario prompt', () => {
      const prompt = generateScenarioPrompt('first_investment', {});
      expect(prompt).toContain('first investment');
      expect(prompt).toContain('smart choice');
    });

    it('should generate diversification scenario prompt', () => {
      const prompt = generateScenarioPrompt('diversification', {});
      expect(prompt).toContain('diversify');
      expect(prompt).toContain('balanced portfolio');
    });

    it('should fallback to contextual prompt for unknown scenario', () => {
      const context: PromptContext = { firstName: 'Alice' };
      const prompt = generateScenarioPrompt('unknown_scenario', context);
      expect(prompt).toContain('how to get started');
    });
  });

  describe('generateTimelinePrompt', () => {
    it('should generate short-term investment prompt', () => {
      const prompt = generateTimelinePrompt('less_than_1_year', {});
      expect(prompt).toContain('short-term goal');
      expect(prompt).toContain('less than a year');
    });

    it('should generate long-term investment prompt', () => {
      const prompt = generateTimelinePrompt('10_plus_years', {});
      expect(prompt).toContain('retirement');
      expect(prompt).toContain('long-term wealth building');
    });

    it('should fallback to contextual prompt for unknown timeline', () => {
      const context: PromptContext = { firstName: 'Bob' };
      const prompt = generateTimelinePrompt('unknown_timeline', context);
      expect(prompt).toContain('how to get started');
    });
  });

  describe('generateActionBasedPrompt', () => {
    it('should generate watchlist prompt with symbol', () => {
      const prompt = generateActionBasedPrompt('added_to_watchlist', 'TSLA');
      expect(prompt).toContain('TSLA');
      expect(prompt).toContain('added');
      expect(prompt).toContain('research this company');
    });

    it('should generate watchlist prompt without symbol', () => {
      const prompt = generateActionBasedPrompt('added_to_watchlist');
      expect(prompt).toContain('adding stocks');
      expect(prompt).toContain('analyze these companies');
    });

    it('should generate first-time visitor prompt', () => {
      const prompt = generateActionBasedPrompt('first_time_visitor');
      expect(prompt).toContain('first investment');
      expect(prompt).toContain('get started');
      expect(prompt).toContain('investment opportunities');
    });
  });

  describe('sanitizePromptContext', () => {
    it('should sanitize and validate context properties', () => {
      const rawContext = {
        firstName: '  John  ',
        currentSymbol: '  aapl  ',
        hasPositions: 'true' as any, // Type assertion to test invalid boolean
        portfolioValue: '1000' as any, // Type assertion to test invalid number
        invalidProperty: 'should be removed'
      };

      const sanitized = sanitizePromptContext(rawContext);
      
      expect(sanitized.firstName).toBe('John');
      expect(sanitized.currentSymbol).toBe('AAPL');
      expect(sanitized.hasPositions).toBeUndefined(); // Invalid boolean
      expect(sanitized.portfolioValue).toBeUndefined(); // Invalid number
      expect('invalidProperty' in sanitized).toBe(false);
    });

    it('should handle empty or undefined values', () => {
      const rawContext = {
        firstName: '',
        currentSymbol: undefined,
        investmentGoals: null as any // Type assertion to test null handling
      };

      const sanitized = sanitizePromptContext(rawContext);
      
      expect(sanitized.firstName).toBeUndefined();
      expect(sanitized.currentSymbol).toBeUndefined();
      expect(sanitized.investmentGoals).toBeUndefined();
    });
  });

  describe('getFallbackPrompt', () => {
    it('should return a generic helpful prompt', () => {
      const prompt = getFallbackPrompt();
      expect(prompt).toContain('investment research');
      expect(prompt).toContain('evaluating stocks');
      expect(prompt).toContain('guide me');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete user context for new investor', () => {
      const context: PromptContext = {
        firstName: 'Jennifer',
        riskTolerance: 'conservative',
        hasPositions: false,
        experienceLevel: 'no_experience'
      };

      const prompt = generateContextualPrompt(context);
      expect(prompt).toContain('I want to invest');
      expect(prompt).toContain('how to get started');
      // No longer includes risk tolerance since Clera already knows it
    });

    it('should handle experienced investor looking at specific stock', () => {
      const context: PromptContext = {
        firstName: 'Robert',
        riskTolerance: 'aggressive',
        hasPositions: true,
        currentSymbol: 'NVDA',
        experienceLevel: 'professional'
      };

      const prompt = generateContextualPrompt(context);
      expect(prompt).toContain('NVDA');
      expect(prompt).toContain('analyze this company');
    });

    it('should handle user with incomplete data gracefully', () => {
      const context: PromptContext = {
        hasPositions: false, // Incomplete data
        riskTolerance: undefined
      };

      const prompt = generateContextualPrompt(context);
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(50); // Should still be meaningful
    });
  });
});
