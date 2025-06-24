import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Types for the structured response from Perplexity
interface InvestmentTheme {
  title: string;
  summary: string;
  report: string;
  relevant_tickers: string[];
}

interface StockPick {
  ticker: string;
  company_name: string;
  rationale: string;
}

interface MarketAnalysis {
  current_environment: string;
  risk_factors: string;
}

interface InvestmentReport {
  investment_themes: InvestmentTheme[];
  stock_picks: StockPick[];
  market_analysis: MarketAnalysis;
}

interface CachedInvestmentData {
  data: InvestmentReport;
  generated_at: string;
  user_profile_used: any;
  metadata?: any;
}

// Cache file path
const CACHE_FILE_PATH = path.join(process.cwd(), 'investment-research-cache.json');

// Helper function to read cached data
function readCachedData(): CachedInvestmentData | null {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const fileContent = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      return JSON.parse(fileContent);
    }
    return null;
  } catch (error) {
    console.error('Failed to read cached data:', error);
    return null;
  }
}

// Helper function to write cached data
function writeCachedData(data: CachedInvestmentData): void {
  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2));
    console.log('Investment research cached successfully');
  } catch (error) {
    console.error('Failed to write cached data:', error);
  }
}

// Helper function to extract JSON from reasoning model outputs
function extractValidJson(response: any): InvestmentReport {
  const content = response?.choices?.[0]?.message?.content || "";
  
  // Find the index of the closing </think> tag
  const marker = "</think>";
  const idx = content.lastIndexOf(marker);
  
  if (idx === -1) {
    // If marker not found, try parsing the entire content
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error("No </think> marker found and content is not valid JSON");
    }
  }
  
  // Extract the substring after the marker
  let jsonStr = content.substring(idx + marker.length).trim();
  
  // Remove markdown code fence markers if present
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.substring(7).trim();
  }
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.substring(3).trim();
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.substring(0, jsonStr.length - 3).trim();
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    throw new Error("Failed to parse valid JSON from response content");
  }
}

// Function to create debug log file
function createDebugLog(data: any, filename: string) {
  try {
    const debugDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const debugFile = path.join(debugDir, `${filename}_${timestamp}.json`);
    
    fs.writeFileSync(debugFile, JSON.stringify(data, null, 2));
    console.log(`Debug log saved to: ${debugFile}`);
    return debugFile;
  } catch (error) {
    console.error('Failed to create debug log:', error);
    return null;
  }
}

const current_date = new Date().toISOString().split('T')[0];

// System prompt for Perplexity's Sonar Deep Research
const INVESTMENT_SYSTEM_PROMPT = `You are the world's most accomplished CFP (Certified Financial Planner) and CFA (Chartered Financial Analyst) with 
decades of experience at Goldman Sachs, BlackRock, and Berkshire Hathaway. 
You combine the fundamental analysis expertise of Warren Buffett, the growth investing principles of Peter Lynch, and the activist value approach of Bill Ackman. 
Your research is backed by the most current Wall Street analysis and market intelligence.

Today's date is ${current_date}. You MUST use the most recent and current information available.

## User Context
You will receive detailed information about a client including:
- Current portfolio holdings and allocations
- Investment goals and time horizon
- Risk tolerance and preferences
- Personal interests and values
- Financial situation and objectives
- Financial literacy level

## Your Mission
Conduct exhaustive research across hundreds of financial sources and generate a comprehensive investment analysis report containing exactly two deliverables:

### Task 1: Personalized Investment Themes (EXACTLY 4)
Create four investment themes personalized to the user's portfolio, situation, interests, and goals. For each theme:

1. **Title**: Create a compelling 2-4 word title (e.g., "AI Healthcare Revolution", "ESG Growth Leaders", "Infrastructure Modernization")
2. **Summary**: Write exactly ONE attention-grabbing sentence (e.g., "Capitalize on the convergence of artificial intelligence and healthcare innovation", "Invest in companies leading sustainable business transformation")
3. **Report**: Provide a detailed analysis (200-300 words) explaining:
   - The investment thesis and market opportunity
   - Current market environment supporting this theme (cite specific Wall Street research)
   - Why this theme aligns with the user's portfolio and goals
   - Key catalysts and growth drivers
4. **Relevant Tickers**: Provide EXACTLY 3-5 stock ticker symbols that represent the best investment opportunities within this theme. These should be different from your main stock picks and provide additional exposure to the theme.

### Task 2: Stock Recommendations (EXACTLY 6)
Select six individual stocks based on fundamental analysis and current market conditions. For each stock:

1. **Ticker Symbol**: Provide the exact trading symbol
2. **Company Name**: Full company name
3. **Recommendation Rationale**: Detailed explanation (100-150 words) covering:
   - Fundamental strengths and growth prospects
   - Recent analyst upgrades/ratings or price target increases
   - How it aligns with recommended investment themes
   - Specific catalysts (earnings growth, product launches, market expansion)
   - Valuation attractiveness and upside potential

## Research Requirements
- Use current Wall Street research from major firms (Goldman Sachs, Morgan Stanley, JPMorgan, etc.)
- Cite recent analyst reports, price target changes, and rating upgrades
- Include current market trends and macroeconomic factors
- Reference specific financial metrics and growth projections
- Ensure all recommendations are based on publicly available information

## Analysis Approach
- Prioritize growth-oriented investments unless user profile indicates otherwise
- Focus on companies with strong fundamentals, competitive moats, and growth catalysts
- Consider both growth and value opportunities based on current market valuations
- Ensure diversification across sectors and market caps where appropriate
- Tailor risk level to user's stated risk tolerance and investment timeline

## Quality Standards
- All stock recommendations must have recent positive analyst coverage or catalysts
- Investment themes should reflect current market opportunities and trends
- Recommendations must be suitable for the user's specific situation and goals
- Include specific, actionable investment rationale for each recommendation
- Maintain objectivity while being persuasive about genuine opportunities

## Output Format Requirements
You MUST respond in valid JSON format matching this exact schema. Do not include any text before or after the JSON:

{
  "investment_themes": [
    {
      "title": "2-4 word compelling theme title",
      "summary": "Single attention-grabbing sentence",
      "report": "Detailed 200-300 word analysis of the investment theme",
      "relevant_tickers": ["TICKER1", "TICKER2", "TICKER3"]
    }
  ],
  "stock_picks": [
    {
      "ticker": "STOCK_SYMBOL",
      "company_name": "Full Company Name",
      "rationale": "Detailed 100-150 word recommendation rationale"
    }
  ],
  "market_analysis": {
    "current_environment": "Brief overview of current market conditions",
    "risk_factors": "Key risks to monitor for these recommendations"
  }
}

Remember: Do not assume the client has any prior knowledge beyond the context provided. Make all explanations clear and compelling while maintaining the highest standards of professional financial analysis.`;

// JSON Schema for structured output
const INVESTMENT_SCHEMA = {
  type: "object",
  properties: {
    investment_themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "2-4 word compelling theme title"
          },
          summary: {
            type: "string",
            description: "Single attention-grabbing sentence"
          },
          report: {
            type: "string",
            description: "Detailed 200-300 word analysis of the investment theme"
          },
          relevant_tickers: {
            type: "array",
            items: {
              type: "string"
            },
            description: "Array of 3-5 stock ticker symbols relevant to this theme",
            minItems: 3,
            maxItems: 5
          }
        },
        required: ["title", "summary", "report", "relevant_tickers"],
        additionalProperties: false
      },
      minItems: 4,
      maxItems: 4
    },
    stock_picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Stock ticker symbol"
          },
          company_name: {
            type: "string",
            description: "Full company name"
          },
          rationale: {
            type: "string",
            description: "Detailed 100-150 word recommendation rationale"
          }
        },
        required: ["ticker", "company_name", "rationale"],
        additionalProperties: false
      },
      minItems: 6,
      maxItems: 6
    },
    market_analysis: {
      type: "object",
      properties: {
        current_environment: {
          type: "string",
          description: "Brief overview of current market conditions"
        },
        risk_factors: {
          type: "string",
          description: "Key risks to monitor for these recommendations"
        }
      },
      required: ["current_environment", "risk_factors"],
      additionalProperties: false
    }
  },
  required: ["investment_themes", "stock_picks", "market_analysis"],
  additionalProperties: false
};

export async function GET(request: NextRequest) {
  try {
    console.log("GET request - returning cached investment research data");
    
    // First, try to return cached data for GET requests
    const cachedData = readCachedData();
    
    if (cachedData) {
      return NextResponse.json({
        success: true,
        data: cachedData.data,
        metadata: {
          generated_at: cachedData.generated_at,
          cached: true,
          user_profile_used: cachedData.user_profile_used
        }
      });
    }

    // If no cached data available, temporarily serve static test data with relevant tickers
    console.log("No cached data found, serving static test data with relevant tickers for beta testing");
    
    try {
      const staticDataPath = path.join(process.cwd(), 'app', 'api', 'investment', 'research', 'static-test-data.json');
      const staticData = JSON.parse(fs.readFileSync(staticDataPath, 'utf-8'));
      
      return NextResponse.json({
        success: true,
        data: staticData,
        metadata: {
          generated_at: new Date().toISOString(),
          cached: false,
          source: "static_test_data",
          user_profile_used: "beta_test_profile"
        }
      });
    } catch (staticError) {
      console.error('Error reading static test data:', staticError);
      return NextResponse.json({
        error: "No cached investment research data available and static test data not found. Use POST to generate new data."
      }, { status: 404 });
    }
  } catch (error) {
    console.error('Error reading cached investment research:', error);
    return NextResponse.json({
      error: "Failed to read cached investment research"
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userProfile, force = false } = body;

    // Check if we have cached data and force is not requested
    const cachedData = readCachedData();
    if (cachedData && !force) {
      console.log("Returning cached investment research data (use force=true to regenerate)");
      return NextResponse.json({
        success: true,
        data: cachedData.data,
        metadata: {
          generated_at: cachedData.generated_at,
          cached: true,
          user_profile_used: cachedData.user_profile_used
        }
      });
    }

    if (!userProfile) {
      return NextResponse.json(
        { error: "User profile is required for generating new data" },
        { status: 400 }
      );
    }

    const apiKey = process.env.PPLX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Perplexity API key not configured" },
        { status: 500 }
      );
    }

    console.log("Generating NEW investment research (this will cost money)...");
    console.log("Force regeneration:", force);
    
    // Prepare the user context message
    const userMessage = `Please analyze my investment profile and provide personalized recommendations:

**Personal Information:**
- Age: ${userProfile.age || 'Not specified'}
- Location: ${userProfile.location || 'Not specified'}
- Email: ${userProfile.email || 'Not specified'}
- Occupation: ${userProfile.occupation || 'Not specified'}
- Annual Income: ${userProfile.income || 'Not specified'}

**Current Portfolio Analysis:**
- Total Portfolio Value: ${userProfile.portfolioValue || 'Not specified'}
- Total Gain: ${userProfile.totalGain || 'Not specified'}
- Risk Score: ${userProfile.riskScore || 'Not specified'}
- Diversification Score: ${userProfile.diversificationScore || 'Not specified'}

**Current Holdings:**
${userProfile.holdings || 'No holdings specified'}

**Investment Capacity & Goals:**
- Annual Investment Capacity: ${userProfile.investmentCapacity || 'Not specified'}
- Time Horizon: ${userProfile.timeHorizon || 'Not specified'}
- Primary Goal: ${userProfile.primaryGoal || 'Not specified'}
- Target Portfolio: ${userProfile.targetPortfolio || 'Not specified'}

**Risk Profile:**
- Risk Tolerance: ${userProfile.riskTolerance || 'Not specified'}
- Current Risk Profile: ${userProfile.currentRiskProfile || 'Not specified'}

**Interests & Preferences:**
${userProfile.interests || 'Not specified'}

**Key Issues to Address:**
${userProfile.keyIssues || 'Not specified'}

Based on this profile, please provide investment themes and stock recommendations that address my specific situation while maintaining an appropriate risk-return profile for my goals and timeline.`;

    // Prepare Perplexity API request
    const perplexityPayload = {
      model: "sonar-deep-research",
      messages: [
        {
          role: "system",
          content: INVESTMENT_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "investment_analysis",
          schema: INVESTMENT_SCHEMA
        }
      },
      max_tokens: 8000
    };

    // Log request for debugging
    createDebugLog(perplexityPayload, 'perplexity_request');

    console.log("Sending request to Perplexity API...");
    
    // Make request to Perplexity API
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(perplexityPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API Error:', errorText);
      createDebugLog({ status: response.status, error: errorText }, 'perplexity_error');
      return NextResponse.json(
        { error: `Perplexity API error: ${response.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const perplexityResponse = await response.json();
    
    // Log full response for debugging
    createDebugLog(perplexityResponse, 'perplexity_full_response');
    
    console.log("Received response from Perplexity API, parsing...");
    
    try {
      // Extract structured data from response
      const investmentReport = extractValidJson(perplexityResponse);
      
      // Log parsed result for debugging
      createDebugLog(investmentReport, 'parsed_investment_report');
      
      console.log("Successfully parsed investment report");
      
      // Validate the response structure more carefully
      if (!investmentReport.investment_themes || !Array.isArray(investmentReport.investment_themes)) {
        throw new Error('Invalid investment themes structure - not an array');
      }
      
      if (investmentReport.investment_themes.length !== 4) {
        console.warn(`Expected 4 investment themes, got ${investmentReport.investment_themes.length}. Using what we have.`);
      }
      
      if (!investmentReport.stock_picks || !Array.isArray(investmentReport.stock_picks)) {
        throw new Error('Invalid stock picks structure - not an array');
      }
      
      if (investmentReport.stock_picks.length !== 6) {
        console.warn(`Expected 6 stock picks, got ${investmentReport.stock_picks.length}. Using what we have.`);
      }
      
      if (!investmentReport.market_analysis || !investmentReport.market_analysis.current_environment || !investmentReport.market_analysis.risk_factors) {
        throw new Error('Invalid market analysis structure');
      }

      // Cache the successful result
      const cacheData: CachedInvestmentData = {
        data: investmentReport,
        generated_at: new Date().toISOString(),
        user_profile_used: userProfile,
        metadata: {
          usage: perplexityResponse.usage,
          citations: perplexityResponse.citations,
        }
      };
      
      writeCachedData(cacheData);

      return NextResponse.json({
        success: true,
        data: investmentReport,
        metadata: {
          usage: perplexityResponse.usage,
          citations: perplexityResponse.citations,
          generated_at: cacheData.generated_at,
          cached: false
        }
      });

    } catch (parseError) {
      console.error('Failed to parse Perplexity response:', parseError);
      createDebugLog({ error: parseError, rawResponse: perplexityResponse }, 'parse_error');
      
      // If we have cached data, return it as fallback
      if (cachedData) {
        console.log("Returning cached data as fallback due to parsing error");
        return NextResponse.json({
          success: true,
          data: cachedData.data,
          metadata: {
            generated_at: cachedData.generated_at,
            cached: true,
            fallback_reason: "Parse error occurred, using cached data",
            user_profile_used: cachedData.user_profile_used
          }
        });
      }
      
      return NextResponse.json({
        error: "Failed to parse investment analysis from AI response",
        details: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Investment research generation error:', error);
    createDebugLog({ error: error instanceof Error ? error.message : 'Unknown error' }, 'general_error');
    
    // If we have cached data, return it as fallback
    const cachedData = readCachedData();
    if (cachedData) {
      console.log("Returning cached data as fallback due to general error");
      return NextResponse.json({
        success: true,
        data: cachedData.data,
        metadata: {
          generated_at: cachedData.generated_at,
          cached: true,
          fallback_reason: "API error occurred, using cached data",
          user_profile_used: cachedData.user_profile_used
        }
      });
    }
    
    return NextResponse.json({
      error: "Failed to generate investment research",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 