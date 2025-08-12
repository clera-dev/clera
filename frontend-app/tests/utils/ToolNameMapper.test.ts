/**
 * Unit tests for ToolNameMapper
 * Tests the tool name mapping logic and filtering functionality
 */

import { ToolNameMapper, defaultToolMapper } from '@/utils/services/ToolNameMapper';

describe('ToolNameMapper', () => {
  let mapper: ToolNameMapper;

  beforeEach(() => {
    mapper = new ToolNameMapper();
  });

  describe('mapToolName', () => {
    it('should map exact tool names correctly', () => {
      // Financial Analyst Tools
      expect(mapper.mapToolName('web_search')).toBe('Researching market information');
      expect(mapper.mapToolName('get_stock_price')).toBe('Checking latest stock prices');
      expect(mapper.mapToolName('calculate_investment_performance')).toBe('Analyzing investment performance');

      // Portfolio Management Tools
      expect(mapper.mapToolName('get_portfolio_summary')).toBe('Looking at your portfolio');
      expect(mapper.mapToolName('rebalance_instructions')).toBe('Investigating need for portfolio rebalancing');
      expect(mapper.mapToolName('get_account_activities')).toBe('Reviewing your trading history');

      // Trade Execution Tools
      expect(mapper.mapToolName('execute_buy_market_order')).toBe('Executing buy order');
      expect(mapper.mapToolName('execute_sell_market_order')).toBe('Executing sell order');
    });

    it('should handle case insensitive matching', () => {
      expect(mapper.mapToolName('WEB_SEARCH')).toBe('Researching market information');
      expect(mapper.mapToolName('Get_Portfolio_Summary')).toBe('Looking at your portfolio');
      expect(mapper.mapToolName('EXECUTE_BUY_MARKET_ORDER')).toBe('Executing buy order');
    });

    it('should use keyword patterns for partial matches', () => {
      expect(mapper.mapToolName('portfolio_analysis')).toBe('Reviewing your portfolio');
      expect(mapper.mapToolName('check_stock_prices')).toBe('Checking latest stock prices');
      expect(mapper.mapToolName('web_research')).toBe('Researching market information');
    });

    it('should use default transformation for unmapped tools', () => {
      expect(mapper.mapToolName('custom_tool_name')).toBe('Custom Tool Name');
      expect(mapper.mapToolName('snake_case_function')).toBe('Snake Case Function');
      expect(mapper.mapToolName('kebab-case-tool')).toBe('Kebab Case Tool');
    });

    it('should handle empty and invalid inputs', () => {
      expect(mapper.mapToolName('')).toBe('');
      expect(mapper.mapToolName('   ')).toBe('');
      // @ts-ignore - testing runtime behavior
      expect(mapper.mapToolName(null)).toBe('');
      // @ts-ignore - testing runtime behavior
      expect(mapper.mapToolName(undefined)).toBe('');
    });

    it('should prioritize higher priority keyword patterns', () => {
      // High priority pattern should match over lower priority for non-exact matches
      const customMapper = new ToolNameMapper({
        exactMatches: {}, // Override to remove defaults
        keywordPatterns: [
          { keywords: ['test'], description: 'Low Priority Test', priority: 1 },
          { keywords: ['test', 'priority'], description: 'High Priority Test', priority: 10 }
        ]
      });

      // Test with custom keywords that don't conflict with defaults
      expect(customMapper.mapToolName('test_priority_tool')).toBe('High Priority Test');
      // Lower priority should not be matched when higher priority exists
      expect(customMapper.mapToolName('test_tool')).toBe('Low Priority Test');
    });
  });

  describe('shouldFilterTool', () => {
    it('should NOT filter transfer tools with valid mappings', () => {
      // Transfer tools with valid descriptions should appear in timeline
      expect(mapper.shouldFilterTool('transfer_to_financial_analyst_agent')).toBe(false);
      expect(mapper.shouldFilterTool('transfer_to_portfolio_management_agent')).toBe(false);
      expect(mapper.shouldFilterTool('transfer_back_to_clera')).toBe(false);
    });

    it('should filter out tools with empty descriptions', () => {
      const customMapper = new ToolNameMapper({
        exactMatches: {
          'empty_tool': ''
        }
      });

      expect(customMapper.shouldFilterTool('empty_tool')).toBe(true);
    });

    it('should filter out generic agent names', () => {
      expect(mapper.shouldFilterTool('clera')).toBe(true);
      expect(mapper.shouldFilterTool('agent')).toBe(true);
      expect(mapper.shouldFilterTool('Agent')).toBe(true);
      expect(mapper.shouldFilterTool('portfolio_management_agent')).toBe(true);
    });

    it('should not filter valid tools', () => {
      expect(mapper.shouldFilterTool('web_search')).toBe(false);
      expect(mapper.shouldFilterTool('get_portfolio_summary')).toBe(false);
      expect(mapper.shouldFilterTool('execute_buy_market_order')).toBe(false);
    });

    it('should filter tools matching agent patterns', () => {
      expect(mapper.shouldFilterTool('clera')).toBe(true);
      expect(mapper.shouldFilterTool('agent')).toBe(true);
      expect(mapper.shouldFilterTool('CLERA')).toBe(true);
    });
  });

  describe('mapToolNames', () => {
    it('should batch map multiple tool names', () => {
      const toolNames = [
        'web_search',
        'get_portfolio_summary',
        'execute_buy_market_order'
      ];

      const expected = [
        'Researching market information',
        'Looking at your portfolio',
        'Executing buy order'
      ];

      expect(mapper.mapToolNames(toolNames)).toEqual(expected);
    });

    it('should filter out empty descriptions in batch mapping', () => {
      const toolNames = [
        'web_search',
        'transfer_back_to_clera',
        'get_portfolio_summary'
      ];

      const expected = [
        'Researching market information',
        'Putting it all together',
        'Looking at your portfolio'
      ];

      expect(mapper.mapToolNames(toolNames)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(mapper.mapToolNames([])).toEqual([]);
    });
  });

  describe('configuration', () => {
    it('should allow custom exact matches', () => {
      const customMapper = new ToolNameMapper({
        exactMatches: {
          'custom_tool': 'Custom Description'
        }
      });

      expect(customMapper.mapToolName('custom_tool')).toBe('Custom Description');
    });

    it('should allow custom keyword patterns', () => {
      const customMapper = new ToolNameMapper({
        keywordPatterns: [
          { keywords: ['test'], description: 'Test Description', priority: 10 }
        ]
      });

      expect(customMapper.mapToolName('test_tool')).toBe('Test Description');
    });

    it('should allow custom default transform', () => {
      const customMapper = new ToolNameMapper({
        defaultTransform: (name) => `CUSTOM: ${name.toUpperCase()}`
      });

      expect(customMapper.mapToolName('unknown_tool')).toBe('CUSTOM: UNKNOWN_TOOL');
    });
  });

  describe('defaultToolMapper', () => {
    it('should be a singleton instance', () => {
      expect(defaultToolMapper).toBeInstanceOf(ToolNameMapper);
      expect(defaultToolMapper.mapToolName('web_search')).toBe('Researching market information');
    });
  });

  describe('debugging methods', () => {
    it('should return exact matches for debugging', () => {
      const exactMatches = mapper.getExactMatches();
      expect(exactMatches).toHaveProperty('web_search');
      expect(exactMatches).toHaveProperty('get_portfolio_summary');
    });

    it('should return keyword patterns for debugging', () => {
      const patterns = mapper.getKeywordPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty('keywords');
      expect(patterns[0]).toHaveProperty('description');
      expect(patterns[0]).toHaveProperty('priority');
    });
  });
});
