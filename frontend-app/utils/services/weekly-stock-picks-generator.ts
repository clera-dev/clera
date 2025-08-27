import { OpenAI } from 'openai';
import { WeeklyStockPicksPersonalizationService } from '@/utils/services/weekly-stock-picks-personalization';
import { WeeklyStockPicksData, WeeklyStockPicksInsert, PerplexityStockPicksResponse } from '@/lib/types/weekly-stock-picks';
import { fetchUserPersonalization } from '@/lib/server/personalization-service';
import { fetchUserPortfolioString } from '@/utils/services/portfolio-fetcher';

// Helper function to get the Monday of the current week in Pacific Time
function getMondayOfWeek(): string {
  const now = new Date();
  
  // Convert to Pacific Time
  const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  
  // Get the Monday of this week
  const dayOfWeek = pacificTime.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday is 0, Monday is 1
  
  const monday = new Date(pacificTime);
  monday.setDate(pacificTime.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  
  return monday.toISOString().split('T')[0]; // Return YYYY-MM-DD format
}

// Helper function to update user processing status
async function updateUserStatus(userId: string, weekOf: string, status: string, supabase: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_weekly_stock_picks')
      .upsert({
        user_id: userId,
        week_of: weekOf,
        status: status,
        stock_picks: [],
        investment_themes: [],
        market_analysis: { current_environment: '', risk_factors: '', opportunities: '' },
        citations: [],
        generated_at: new Date().toISOString(),
        model: 'sonar-deep-research'
      }, { 
        onConflict: 'user_id,week_of',
        ignoreDuplicates: false 
      });

    if (error) {
      console.error(`Failed to update status for user ${userId}:`, error);
    } else {
      console.log(`✅ Status updated to '${status}' for user ${userId}`);
    }
  } catch (error) {
    console.error(`Error updating status for user ${userId}:`, error);
  }
}

// Helper function to sanitize and extract JSON from Perplexity response
function extractJsonContent(responseText: string): string | null {
  if (!responseText) return null;
  
  console.log(`Extracting JSON from response (${responseText.length} chars)`);
  
  // Handle Perplexity Deep Research responses that may contain <think> reasoning
  let jsonContent = responseText;
  
  // Check if response contains <think> reasoning tags (like our working script)
  if (responseText.includes('<think>') && responseText.includes('</think>')) {
    console.log('🧠 Detected reasoning content in response, extracting JSON...');
    const thinkEndIndex = responseText.lastIndexOf('</think>');
    if (thinkEndIndex !== -1) {
      jsonContent = responseText.substring(thinkEndIndex + 8).trim(); // Skip '</think>' + whitespace
      console.log(`✅ Extracted JSON content after <think> tags (${jsonContent.length} chars)`);
    }
  }
  
  // Strategy 1: Try to find JSON in markdown code blocks first
  const markdownMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
    const potentialJson = markdownMatch[1].trim();
    try {
      JSON.parse(potentialJson);
      console.log('✅ Successfully extracted JSON from markdown blocks');
      return potentialJson;
    } catch (e) {
      console.warn('Failed to parse markdown JSON content:', e);
    }
  }
  
  // Strategy 2: Try to find the most complete JSON object
  const bracePairs = [];
  let openBraces = 0;
  let startIndex = -1;
  
  for (let i = 0; i < jsonContent.length; i++) {
    if (jsonContent[i] === '{') {
      if (openBraces === 0) {
        startIndex = i;
      }
      openBraces++;
    } else if (jsonContent[i] === '}') {
      openBraces--;
      if (openBraces === 0 && startIndex !== -1) {
        bracePairs.push({
          start: startIndex,
          end: i,
          content: jsonContent.substring(startIndex, i + 1)
        });
      }
    }
  }
  
  // Try each potential JSON object, starting with the longest
  bracePairs.sort((a, b) => b.content.length - a.content.length);
  
  for (const pair of bracePairs) {
    try {
      const parsed = JSON.parse(pair.content);
      // Validate that it has the expected structure
      if (parsed.stock_picks && parsed.investment_themes && parsed.market_analysis) {
        console.log('✅ Successfully extracted and validated JSON object');
        return pair.content;
      }
    } catch (e) {
      // Continue to next potential JSON
      continue;
    }
  }
  
  // Strategy 3: Try simple brace extraction (original approach)
  const firstBrace = jsonContent.indexOf('{');
  const lastBrace = jsonContent.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = jsonContent.substring(firstBrace, lastBrace + 1).trim();
    try {
      JSON.parse(potentialJson);
      console.log('✅ Successfully extracted JSON from simple braces');
      return potentialJson;
    } catch (e) {
      console.warn('Failed to parse brace-enclosed JSON:', e);
    }
  }
  
  // Strategy 4: Try parsing the entire content as JSON
  try {
    JSON.parse(jsonContent);
    console.log('✅ Successfully parsed entire content as JSON');
    return jsonContent;
  } catch (e) {
    console.warn('Failed to parse entire content as JSON:', e);
  }
  
  console.error('❌ Failed to extract valid JSON from response');
  return null;
}

// Create system prompt for Perplexity
function createStockPicksSystemPrompt(): string {
  const currentDate = new Date().toISOString().split('T')[0];
  
  return `You are the world's most accomplished investment strategist, combining the fundamental analysis expertise of Warren Buffett, the growth investing principles of Peter Lynch, and the quantitative rigor of Renaissance Technologies. You have 30+ years of experience at Goldman Sachs, BlackRock, and Berkshire Hathaway.

Today's date is ${currentDate}. You MUST use the most recent and current information available.

## Critical Analysis Requirements:
- Include specific quantitative metrics (revenue growth %, P/E ratios, market cap, financial performance data)
- Reference actual financial data, earnings reports, and verifiable analyst coverage
- Cite specific price targets, analyst ratings, and valuation metrics when available
- Use concrete numbers and percentages to support investment rationale
- Ground all recommendations in measurable, factual financial performance

## Your Mission
Generate personalized weekly stock picks and investment themes based on deep fundamental analysis and current market conditions. This is for serious investors with real money, so accuracy and thoroughness are paramount.

## Research Requirements
- Conduct exhaustive research across hundreds of financial sources
- Use current Wall Street research from major firms (Goldman Sachs, Morgan Stanley, JPMorgan, etc.)
- Include recent analyst reports, price target changes, and rating upgrades
- Reference latest earnings reports, SEC filings, and company guidance
- Analyze current macroeconomic conditions and sector rotation trends
- Consider recent news, regulatory changes, and geopolitical factors

## Output Requirements
You MUST respond with valid JSON matching this exact schema:

{
  "stock_picks": [
    {
      "ticker": "STOCK_SYMBOL", 
      "company_name": "Full Company Name",
      "rationale": "Clear, readable analysis in bullet format. Write 3-4 bullets, each 20-25 words maximum. Cover: • Key strengths • Recent catalysts • Why it fits profile • Valuation case. Use bullet points (•) for mobile readability.",
      "risk_level": "low/medium/high"
    }
  ],
  "investment_themes": [
    {
      "title": "2-4 word compelling theme title",
      "summary": "Single attention-grabbing sentence explaining the opportunity",
      "report": "Well-structured analysis in 2-3 clear paragraphs (max 80 words each). Paragraph 1: Investment thesis and market opportunity. Paragraph 2: Current catalysts and growth drivers. Paragraph 3: Why this fits user's profile and timeline. Use line breaks between paragraphs for mobile readability.",
      "relevant_tickers": ["TICKER1", "TICKER2", "TICKER3", "TICKER4"],
      "theme_category": "Technology/Healthcare/Financial/Energy/etc."
    }
  ],
  "market_analysis": {
    "current_environment": "Brief overview of current market conditions affecting recommendations",
    "risk_factors": "Key risks to monitor for these recommendations",
    "opportunities": "Major opportunities driving these selections"
  }
}

## Deliverable Requirements:
- EXACTLY 6 stock picks with detailed fundamental analysis
- EXACTLY 4 investment themes with supporting tickers  
- Each stock pick must include risk assessment and fundamental rationale
- All recommendations must be based on current, verifiable research
- Tailor all content to the user's specific risk profile, timeline, and interests

## Critical Formatting for Mobile Readability:
- Stock rationales MUST use bullet points (•) with 20-25 words per bullet maximum
- Investment theme reports MUST use clear paragraph breaks between ideas
- Avoid wall-of-text formatting - users read this on mobile devices
- Each bullet/paragraph should be digestible and scannable

Remember: This analysis will guide real investment decisions. Maintain the highest standards of professional financial analysis while being compelling, actionable, and easily readable on mobile devices.`;
}

// JSON schema for structured output validation
const STOCK_PICKS_SCHEMA = {
  type: "object",
  properties: {
    stock_picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          company_name: { type: "string" },
          rationale: { type: "string" },
          risk_level: { type: "string", enum: ["low", "medium", "high"] }
        },
        required: ["ticker", "company_name", "rationale", "risk_level"],
        additionalProperties: false
      },
      minItems: 6,
      maxItems: 6
    },
    investment_themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          report: { type: "string" },
          relevant_tickers: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 5
          },
          theme_category: { type: "string" }
        },
        required: ["title", "summary", "report", "relevant_tickers", "theme_category"],
        additionalProperties: false
      },
      minItems: 4,
      maxItems: 4
    },
    market_analysis: {
      type: "object",
      properties: {
        current_environment: { type: "string" },
        risk_factors: { type: "string" },
        opportunities: { type: "string" }
      },
      required: ["current_environment", "risk_factors", "opportunities"],
      additionalProperties: false
    }
  },
  required: ["stock_picks", "investment_themes", "market_analysis"],
  additionalProperties: false
};

// Generate stock picks for a single user (shared between cron and on-demand)
export async function generateStockPicksForUser(
  userId: string, 
  supabase: any
): Promise<WeeklyStockPicksInsert | null> {
  try {
    console.log(`🚀 Deep research has commenced for user ${userId}`);
    
    const weekOf = getMondayOfWeek();
    
    // Note: Status should already be 'started' by the calling function
    // Update to 'processing' as we begin actual work
    await updateUserStatus(userId, weekOf, 'processing', supabase);
    console.log(`Fetching personalization data for user ${userId}...`);
    
    const personalizationData = await fetchUserPersonalization(userId, supabase, { throwOnError: false });
    console.log(`Personalization data for user ${userId}:`, personalizationData ? 'Found' : 'Not found');
    
    // Extract personalized context
    const userGoals = WeeklyStockPicksPersonalizationService.getUserGoalsSummary(personalizationData);
    const riskTolerance = WeeklyStockPicksPersonalizationService.getRiskToleranceLevel(personalizationData);
    const investmentTimeline = WeeklyStockPicksPersonalizationService.getInvestmentTimeline(personalizationData);
    const financialLiteracy = WeeklyStockPicksPersonalizationService.getFinancialCommunicationLevel(personalizationData);
    const marketInterests = WeeklyStockPicksPersonalizationService.getMarketInterestsFocus(personalizationData);
    
    // Fetch current portfolio using shared utility (eliminates duplication)
    const portfolioString = await fetchUserPortfolioString(userId, supabase);
    
    const finalPortfolioString = portfolioString || 'No current positions - building new portfolio';
    
    // Build system prompt with personalization
    const baseSystemPrompt = createStockPicksSystemPrompt();
    const enhancedSystemPrompt = WeeklyStockPicksPersonalizationService.enhanceSystemPrompt(
      baseSystemPrompt, 
      personalizationData
    );
    
    // Create user message with comprehensive context
    const userMessage = `Generate personalized weekly stock picks based on my investment profile:

**Investment Profile:**
- Investment Goals: ${userGoals}
- Risk Tolerance: ${riskTolerance}
- Investment Timeline: ${investmentTimeline}
- Financial Literacy: ${financialLiteracy}
- Market Interests: ${marketInterests.length > 0 ? marketInterests.join(', ') : 'Diversified across sectors'}
- Monthly Budget: ${personalizationData?.monthlyInvestmentGoal || 500}

**Current Portfolio:**
${finalPortfolioString}

**Requirements:**
1. Provide 6 specific stock picks that align with my risk tolerance and timeline
2. Create 4 investment themes based on my interests and current market opportunities  
3. Include detailed fundamental analysis and specific catalysts for each recommendation
4. Ensure recommendations fit my experience level with appropriate explanations
5. Focus on companies with strong competitive advantages and growth potential

Please conduct deep research and provide current, actionable investment recommendations for this week.`;

    // Prepare Perplexity API request
    const perplexityPayload = {
      model: "sonar-deep-research" as const,
      messages: [
        {
          role: "system" as const,
          content: enhancedSystemPrompt
        },
        {
          role: "user" as const,
          content: userMessage
        }
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "weekly_stock_picks",
          schema: STOCK_PICKS_SCHEMA
        }
      },
      max_tokens: 8000
    };

    // Update status to indicate we're sending to Perplexity
    await updateUserStatus(userId, weekOf, 'sent_to_perplexity', supabase);
    console.log(`📡 Sending request to Perplexity Deep Research for user ${userId}...`);
    
    // Make request to Perplexity API
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PPLX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(perplexityPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Perplexity API Error for user ${userId}:`, errorText);
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }

    const perplexityResponse: PerplexityStockPicksResponse = await response.json();
    console.log(`✅ Received response from Perplexity for user ${userId}`);
    
    // Update status to indicate we're parsing the response
    await updateUserStatus(userId, weekOf, 'parsing_response', supabase);
    console.log(`🔄 Parsing Perplexity response for user ${userId}...`);
    
    const rawResponseContent = perplexityResponse.choices[0].message?.content;
    if (!rawResponseContent) {
      console.error(`No content in Perplexity response for user ${userId}`);
      return null;
    }

    console.log(`🔍 Processing Perplexity response for user ${userId} (${rawResponseContent.length} chars)`);
    
    // CRITICAL: Always save raw response first (before any parsing that might fail)
    await supabase
      .from('user_weekly_stock_picks')
      .upsert({
        user_id: userId,
        week_of: weekOf,
        status: 'parsing_response',
        raw_response: rawResponseContent, // Save raw response for debugging
        stock_picks: [],
        investment_themes: [],
        market_analysis: { current_environment: '', risk_factors: '', opportunities: '' },
        citations: [],
        generated_at: new Date().toISOString(),
        model: 'sonar-deep-research'
      }, { 
        onConflict: 'user_id,week_of',
        ignoreDuplicates: false 
      });
    
    // Handle <think> tags like our successful test script
    let processedContent = rawResponseContent;
    if (rawResponseContent.includes('<think>') && rawResponseContent.includes('</think>')) {
      console.log('🧠 Detected reasoning content in response, extracting JSON...');
      const thinkEndIndex = rawResponseContent.lastIndexOf('</think>');
      if (thinkEndIndex !== -1) {
        processedContent = rawResponseContent.substring(thinkEndIndex + 8).trim();
        console.log(`✅ Extracted JSON content after <think> tags (${processedContent.length} chars)`);
      }
    }

    const stockPicksJsonText = extractJsonContent(processedContent);
    if (!stockPicksJsonText) {
      console.error(`❌ Failed to extract JSON from Perplexity response for user ${userId}`);
      console.error(`Raw response saved to database for debugging. Length: ${rawResponseContent.length} chars`);
      
      // Update status to error but keep the raw response for debugging
      await supabase
        .from('user_weekly_stock_picks')
        .update({ status: 'error' })
        .eq('user_id', userId)
        .eq('week_of', weekOf);
      
      return null;
    }

    let parsedStockPicks: WeeklyStockPicksData;
    try {
      parsedStockPicks = JSON.parse(stockPicksJsonText);
    } catch (e: any) {
      console.error(`❌ Failed to parse JSON for user ${userId}. Error: ${e.message}`);
      console.error(`JSON text that failed to parse (first 1000 chars):`, stockPicksJsonText.substring(0, 1000));
      console.error(`Raw response saved to database for debugging. Length: ${rawResponseContent.length} chars`);
      
      // Update status to error but keep the raw response for debugging
      await supabase
        .from('user_weekly_stock_picks')
        .update({ status: 'error' })
        .eq('user_id', userId)
        .eq('week_of', weekOf);
      
      return null;
    }

    // Validate the parsed data structure
    if (!parsedStockPicks.stock_picks || !Array.isArray(parsedStockPicks.stock_picks) ||
        !parsedStockPicks.investment_themes || !Array.isArray(parsedStockPicks.investment_themes) ||
        !parsedStockPicks.market_analysis) {
      console.error(`Invalid data structure for user ${userId}:`, parsedStockPicks);
      return null;
    }

    // Extract citations from Perplexity response
    const citations = perplexityResponse.citations || [];
    console.log(`Extracted ${citations.length} citations for user ${userId}`);

    // Create the record to upsert (fixes duplicate key violations)
    const upsertRecord = {
      user_id: userId,
      week_of: weekOf,
      stock_picks: parsedStockPicks.stock_picks,
      investment_themes: parsedStockPicks.investment_themes,
      market_analysis: parsedStockPicks.market_analysis,
      citations: citations, // Save the research sources from Perplexity
      raw_response: rawResponseContent, // Keep the raw response for debugging
      status: 'complete', // Mark as complete
      generated_at: new Date().toISOString(),
      model: perplexityResponse.model || 'sonar-deep-research'
    };

    // Use UPSERT to handle potential duplicates gracefully
    const { error: upsertError } = await supabase
      .from('user_weekly_stock_picks')
      .upsert(upsertRecord, { 
        onConflict: 'user_id,week_of',
        ignoreDuplicates: false 
      });

    if (upsertError) {
      console.error(`❌ Failed to save picks for user ${userId}:`, upsertError);
      return null;
    }

    console.log(`🎉 Successfully generated and saved stock picks for user ${userId}. ${parsedStockPicks.stock_picks.length} picks, ${parsedStockPicks.investment_themes.length} themes, ${citations.length} citations`);
    
    // Return data for immediate API response
    return {
      user_id: userId,
      stock_picks: parsedStockPicks.stock_picks,
      investment_themes: parsedStockPicks.investment_themes,
      market_analysis: parsedStockPicks.market_analysis,
      citations: citations,
      status: 'complete' as const,
      generated_at: new Date().toISOString(),
      week_of: weekOf,
      model: perplexityResponse.model || 'sonar-deep-research'
    };

  } catch (error: any) {
    // Update status to error
    const weekOf = getMondayOfWeek();
    await updateUserStatus(userId, weekOf, 'error', supabase);
    console.error(`❌ Failed to generate stock picks for user ${userId}:`, error.message);
    return null;
  }
}
