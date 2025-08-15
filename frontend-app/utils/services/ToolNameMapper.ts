/**
 * ToolNameMapper - Maps internal tool names to human-readable timeline descriptions
 * 
 * This utility follows the Single Responsibility Principle by handling only
 * tool name mapping logic. It provides a centralized place to manage all
 * tool-to-description mappings based on the backend agent tools.
 * 
 * Backend Tool Reference:
 * - Financial Analyst: web_search, get_stock_price, calculate_investment_performance
 * - Portfolio Management: get_portfolio_summary, rebalance_instructions, get_account_activities
 * - Trade Execution: execute_buy_market_order, execute_sell_market_order
 * - Agent Transfers: transfer_to_*, transfer_back_to_clera
 */

export interface ToolMappingConfig {
  /** Primary tool name patterns for exact matches */
  exactMatches: Record<string, string>;
  /** Keyword-based patterns for fuzzy matching */
  keywordPatterns: Array<{
    keywords: string[];
    description: string;
    priority: number; // Higher priority = checked first
  }>;
  /** Default fallback for unmapped tools */
  defaultTransform: (toolName: string) => string;
}

export class ToolNameMapper {
  private config: ToolMappingConfig;

  constructor(config?: Partial<ToolMappingConfig>) {
    const defaultExactMatches = {
      // Initial states
      'thinking': 'Thinking',
      
      // Financial Analyst Tools
      'web_search': 'Researching market information',
      'get_stock_price': 'Checking latest stock prices',
      'calculate_investment_performance': 'Analyzing investment performance',
      
      // Portfolio Management Tools
      'get_portfolio_summary': 'Looking at your portfolio',
      'rebalance_instructions': 'Investigating need for portfolio rebalancing',
      'get_account_activities': 'Reviewing your trading history',
      
      // Trade Execution Tools
      'execute_buy_market_order': 'Executing buy order',
      'execute_sell_market_order': 'Executing sell order',
      
      // Agent Coordination (should not appear as tool calls)
      'transfer_to_financial_analyst_agent': 'Coordinating with financial analyst agent',
      'transfer_to_portfolio_management_agent': 'Coordinating with portfolio management agent',
      'transfer_to_trade_execution_agent': 'Coordinating with trade execution agent',
      // We will map to "Putting it all together" only when confirmed complete.
      'transfer_back_to_clera': 'Putting it all together',
      
      // Legacy/Deprecated Tools
      'execute_trade': 'Executing trade order'
    };

    this.config = {
      exactMatches: config?.exactMatches !== undefined 
        ? { ...defaultExactMatches, ...config.exactMatches }
        : defaultExactMatches,
      
      keywordPatterns: config?.keywordPatterns || [
        // High Priority - Specific Combinations
        { keywords: ['portfolio', 'summary'], description: 'Looking at your portfolio', priority: 10 },
        { keywords: ['rebalance', 'instructions'], description: 'Investigating need for portfolio rebalancing', priority: 10 },
        { keywords: ['account', 'activities'], description: 'Reviewing your trading history', priority: 10 },
        { keywords: ['stock', 'price'], description: 'Checking latest stock prices', priority: 10 },
        { keywords: ['investment', 'performance'], description: 'Analyzing investment performance', priority: 10 },
        { keywords: ['buy', 'market', 'order'], description: 'Executing buy order', priority: 10 },
        { keywords: ['sell', 'market', 'order'], description: 'Executing sell order', priority: 10 },
        
        // Medium Priority - Single Concepts
        { keywords: ['web', 'search'], description: 'Researching market information', priority: 8 },
        { keywords: ['portfolio'], description: 'Reviewing your portfolio', priority: 7 },
        { keywords: ['rebalance'], description: 'Analyzing portfolio optimization', priority: 7 },
        { keywords: ['trade', 'execute'], description: 'Processing trade order', priority: 7 },
        { keywords: ['buy'], description: 'Executing purchase', priority: 6 },
        { keywords: ['sell'], description: 'Executing sale', priority: 6 },
        { keywords: ['price'], description: 'Checking current prices', priority: 6 },
        { keywords: ['market'], description: 'Analyzing market data', priority: 5 },
        { keywords: ['financial'], description: 'Conducting financial analysis', priority: 5 },
        
        // Agent Transfers (should be filtered in timeline)
        { keywords: ['transfer_to'], description: '', priority: 1 }, // Empty = filtered out
        { keywords: ['transfer_back'], description: '', priority: 1 } // Empty = filtered out
      ],
      
      defaultTransform: config?.defaultTransform || this.defaultTransform,
    };
  }

  /**
   * Maps a tool name to a human-readable description
   * @param toolName The internal tool name (e.g., "get_portfolio_summary")
   * @returns Human-readable description (e.g., "Looking at your portfolio")
   */
  public mapToolName(toolName: string): string {
    if (!toolName) return '';
    
    const normalizedName = toolName.toLowerCase().trim();
    
    // 1. Check exact matches first
    const exactMatch = this.config.exactMatches[normalizedName];
    if (exactMatch !== undefined) {
      return exactMatch;
    }
    
    // 2. Check keyword patterns (sorted by priority)
    const sortedPatterns = [...this.config.keywordPatterns].sort((a, b) => b.priority - a.priority);
    
    for (const pattern of sortedPatterns) {
      const matchesAllKeywords = pattern.keywords.every(keyword => 
        normalizedName.includes(keyword.toLowerCase())
      );
      
      if (matchesAllKeywords) {
        return pattern.description;
      }
    }
    
    // 3. Fallback to default transformation
    return this.config.defaultTransform(toolName);
  }

  /**
   * Default transformation for unmapped tool names
   * Converts snake_case to Title Case and cleans up common patterns
   */
  private defaultTransform(toolName: string): string {
    return toolName
      .replace(/[_-]/g, ' ')           // Replace underscores/hyphens with spaces
      .replace(/\s+/g, ' ')           // Normalize multiple spaces
      .trim()                         // Remove leading/trailing spaces
      .toLowerCase()                  // Normalize case
      .replace(/\b\w/g, char => char.toUpperCase()); // Title case
  }

  /**
   * Checks if a tool name should be filtered out from timeline display
   * @param toolName The internal tool name
   * @returns true if the tool should be hidden from timeline
   */
  public shouldFilterTool(toolName: string): boolean {
    const description = this.mapToolName(toolName);
    
    // Filter out internal meta markers
    if (toolName === '__run_completed__') {
      return true;
    }

    // Filter out empty descriptions
    if (!description || description.trim() === '') {
      return true;
    }
    
    const normalizedName = toolName.toLowerCase();

    // Filter out raw agent names (e.g., portfolio_management_agent) but KEEP transfer_to_* which we show as coordination steps
    if (!normalizedName.startsWith('transfer_') && normalizedName.endsWith('_agent')) {
      return true;
    }
    if (normalizedName.match(/^(clera|agent)$/i)) {
      return true;
    }
    
    // Don't filter transfer tools that have valid descriptions
    // (they should appear in the timeline as coordination steps)
    
    return false;
  }

  /**
   * Batch map multiple tool names
   * @param toolNames Array of tool names to map
   * @returns Array of mapped descriptions, filtered for valid entries
   */
  public mapToolNames(toolNames: string[]): string[] {
    return toolNames
      .map(name => this.mapToolName(name))
      .filter(description => description && description.trim() !== '');
  }

  /**
   * Get all exact matches for testing/debugging
   */
  public getExactMatches(): Record<string, string> {
    return { ...this.config.exactMatches };
  }

  /**
   * Get all keyword patterns for testing/debugging
   */
  public getKeywordPatterns(): Array<{keywords: string[]; description: string; priority: number}> {
    return [...this.config.keywordPatterns];
  }
}

// Default instance for easy importing
export const defaultToolMapper = new ToolNameMapper();

// Export type for dependency injection
export type IToolNameMapper = ToolNameMapper;
