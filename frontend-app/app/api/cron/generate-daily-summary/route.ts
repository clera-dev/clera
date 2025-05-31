import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import Sentiment from 'sentiment';
import { getLinkPreview, getPreviewFromContent } from 'link-preview-js';

// Initialize Perplexity client
const perplexity = new OpenAI({
  apiKey: process.env.PPLX_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

const sentimentAnalyzer = new Sentiment();

// Helper function to sanitize a string that is almost JSON by escaping control characters.
function sanitizeForJsonParse(text: string): string {
  const placeholders = {
    doubleBackslash: '__DOUBLE_BACKSLASH_PLACEHOLDER__',
    escapedNewline: '__ESCAPED_NEWLINE_PLACEHOLDER__',
    escapedCarriageReturn: '__ESCAPED_CARRIAGE_RETURN_PLACEHOLDER__',
    escapedTab: '__ESCAPED_TAB_PLACEHOLDER__',
    escapedDoubleQuote: '__ESCAPED_DOUBLE_QUOTE_PLACEHOLDER__',
  };
  let sanitized = text;
  sanitized = sanitized.replace(/\\\\/g, placeholders.doubleBackslash);
  sanitized = sanitized.replace(/\\n/g, placeholders.escapedNewline);
  sanitized = sanitized.replace(/\\r/g, placeholders.escapedCarriageReturn);
  sanitized = sanitized.replace(/\\t/g, placeholders.escapedTab);
  sanitized = sanitized.replace(/\\"/g, placeholders.escapedDoubleQuote);
  sanitized = sanitized.replace(/\n/g, '\\\\n');
  sanitized = sanitized.replace(/\r/g, '\\\\r');
  sanitized = sanitized.replace(/\t/g, '\\\\t');
  sanitized = sanitized.replace(new RegExp(placeholders.doubleBackslash, 'g'), '\\\\\\\\');
  sanitized = sanitized.replace(new RegExp(placeholders.escapedNewline, 'g'), '\\\\n');
  sanitized = sanitized.replace(new RegExp(placeholders.escapedCarriageReturn, 'g'), '\\\\r');
  sanitized = sanitized.replace(new RegExp(placeholders.escapedTab, 'g'), '\\\\t');
  sanitized = sanitized.replace(new RegExp(placeholders.escapedDoubleQuote, 'g'), '\\\\"');
  return sanitized;
}

function extractJsonContent(responseText: string): string | null {
  if (!responseText) return null;
  const markdownMatch = responseText.match(/```(?:json)?\\s*([\\s\\S]*?)\\s*```/);
  if (markdownMatch && markdownMatch[1]) {
    const potentialJson = markdownMatch[1].trim();
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch (e) {
      console.warn('CRON: Failed to parse markdown content directly, trying sanitization. Error:', e);
      try {
        const sanitizedJson = sanitizeForJsonParse(potentialJson);
        JSON.parse(sanitizedJson);
        console.log('CRON: Successfully parsed markdown content after sanitization.');
        return sanitizedJson;
      } catch (e2) {
        console.warn('CRON: Content within markdown block was not valid JSON even after sanitization:', e2, 'Sanitized attempt:', sanitizeForJsonParse(potentialJson), 'Original markdown content:', potentialJson);
      }
    }
  }
  const firstBrace = responseText.indexOf('{');
  const lastBrace = responseText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = responseText.substring(firstBrace, lastBrace + 1).trim();
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch (e) {
      console.warn('CRON: Failed to parse brace-enclosed substring directly, trying sanitization. Error:', e);
      try {
        const sanitizedJson = sanitizeForJsonParse(potentialJson);
        JSON.parse(sanitizedJson);
        console.log('CRON: Successfully parsed brace-enclosed substring after sanitization.');
        return sanitizedJson;
      } catch (e2) {
        console.warn('CRON: Failed to parse substring between first/last braces even after sanitization:', e2, 'Sanitized attempt:', sanitizeForJsonParse(potentialJson), 'Original substring:', potentialJson);
      }
    }
  }
  const trimmedResponse = responseText.trim();
  if (firstBrace === -1 || trimmedResponse !== responseText.substring(firstBrace, lastBrace + 1).trim()) {
    try {
      JSON.parse(trimmedResponse);
      return trimmedResponse;
    } catch(e) {
      console.warn('CRON: Failed to parse trimmed original string directly, trying sanitization. Error:', e);
      try {
        const sanitizedJson = sanitizeForJsonParse(trimmedResponse);
        JSON.parse(sanitizedJson);
        console.log('CRON: Successfully parsed trimmed original string after sanitization.');
        return sanitizedJson;
      } catch (e2) {
       console.error('CRON: Could not extract valid JSON content (all methods, including sanitization, failed). Original text:', responseText, 'Sanitized attempt:', sanitizeForJsonParse(trimmedResponse), 'Error:', e2);
       return null;
      }
    }
  }
  if (markdownMatch && markdownMatch[1]) {
     console.error('CRON: Could not extract valid JSON content. Markdown was found but failed parsing even after sanitization. Original text:', responseText);
  } else {
     console.error('CRON: Could not extract valid JSON content (all methods failed). Original text:', responseText);
  }
  return null;
}

async function enrichArticleDetails(url: string): Promise<any | null> {
  let sourceName = new URL(url).hostname.replace(/^www\./, '');
  let title = '';
  let snippet = '[Snippet Not Available]';
  let sentimentScore = 0;
  let finalUrl = url;
  let shouldDisplay = true;

  // Check if URL ends with .pdf
  if (url.toLowerCase().endsWith('.pdf')) {
    console.warn(`CRON: enrichArticleDetails: Skipping PDF file: ${url}`);
    shouldDisplay = false;
    
    // Create formatted date for fallback title
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    title = `${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}: ${formattedDate}`;
    snippet = 'PDF document (not displayed)';
    
    return {
      url: finalUrl,
      title,
      snippet,
      source: sourceName,
      sentimentScore: 0,
      shouldDisplay: false,
      used_for_paragraph: null 
    };
  }

  try {
    console.log(`CRON: enrichArticleDetails: Fetching preview for ${url} using link-preview-js`);
    
    const previewData: any = await getLinkPreview(url, {
      followRedirects: 'follow',
      timeout: 15000, // Increased timeout from 10000 to 15000 ms
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CleraNewsBot/1.0; +http://www.clera.io/bot.html)',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    finalUrl = previewData.url || finalUrl;
    sourceName = new URL(finalUrl).hostname.replace(/^www\./, '');
    
    // Check if content type is PDF
    if (previewData.contentType && 
        (previewData.contentType.includes('application/pdf') || 
         previewData.mediaType === 'application' ||
         finalUrl.toLowerCase().endsWith('.pdf'))) {
      console.warn(`CRON: enrichArticleDetails: Detected PDF content type for ${finalUrl}`);
      shouldDisplay = false;
      
      // Create formatted date for fallback title
      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      title = `${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}: ${formattedDate}`;
      snippet = 'PDF document (not displayed)';
    } else {
      if (previewData.title) {
        title = previewData.title;
      } else {
        console.warn(`CRON: enrichArticleDetails: link-preview-js did not return a title for ${finalUrl}. Preview data received: mediaType: ${previewData.mediaType}, contentType: ${previewData.contentType}, favicons: ${previewData.favicons ? previewData.favicons.length : 0}. Using fallback.`);
        // Create formatted date for fallback title
        const currentDate = new Date();
        const formattedDate = currentDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        title = `${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}: ${formattedDate}`;
      }

      if (previewData.description) {
        snippet = previewData.description.substring(0, 300) + (previewData.description.length > 300 ? '...' : '');
      } else {
        console.warn(`CRON: enrichArticleDetails: link-preview-js did not return a description for ${finalUrl}. Preview data received: mediaType: ${previewData.mediaType}, contentType: ${previewData.contentType}.`);
      }
      
      const meaningfulTitle = !title.includes("[Preview Error]") && !title.includes("[No Title Found]");
      const meaningfulSnippet = (snippet !== '[Snippet Not Available]' && snippet.length >= 20);
      const textToAnalyze = (meaningfulTitle ? title : '') + ' ' + (meaningfulSnippet ? snippet : '');

      if (textToAnalyze.trim().length > 10) {
          const sentimentResult = sentimentAnalyzer.analyze(textToAnalyze.trim());
          sentimentScore = sentimentResult.comparative;
          console.log(`CRON: enrichArticleDetails: Analyzed sentiment for ${finalUrl}. Score: ${sentimentScore}, Title: "${title}"`);
      } else {
          console.warn(`CRON: enrichArticleDetails: Not enough meaningful text (title/snippet) from link-preview-js to analyze sentiment for ${finalUrl}. Title: "${title}", Snippet: "${snippet}"`);
      }
    }
  } catch (error: any) {
    console.error(`CRON: enrichArticleDetails: Error using link-preview-js for ${url}: ${error.name} - ${error.message}. Raw error object:`, JSON.stringify(error));
    
    // Create formatted date for error fallback
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Set fallback title with date in proper format
    title = `${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}: ${formattedDate}`;
    snippet = `Preview generation failed: ${error.message.substring(0,150)}`;
    
    // Set flag to not display articles with preview errors
    shouldDisplay = false;
    
    if (process.env.NODE_ENV === 'development' && error.stack) {
      console.error(error.stack);
    }
  }
  
  // Additional check to filter out articles with anti-bot protection or empty content
  const isAntiBot = title.toLowerCase().includes('just a moment') || 
                   title.includes('Cloudflare') || 
                   title.includes('DDoS protection') ||
                   title.includes('Security check');
                   
  if (isAntiBot) {
    shouldDisplay = false;
    console.warn(`CRON: enrichArticleDetails: Article from ${sourceName} will not be displayed due to anti-bot protection: "${title}"`);
  }
  
  return {
    url: finalUrl,
    title,
    snippet,
    source: sourceName,
    sentimentScore,
    shouldDisplay,
    used_for_paragraph: null 
  };
}

export async function GET(request: Request) {
  // Basic authorization check
  const authHeader = request.headers.get('Authorization');
  const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;
  
  if (!process.env.CRON_SECRET || authHeader !== expectedHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('Starting daily summary generation cron job (using sonar-pro, medium context)...');

  try {
    // Create Supabase client with proper permissions for this cron job
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('CRON: Supabase URL or Service Role Key is not defined.');
      return NextResponse.json({ error: 'Supabase configuration error' }, { status: 500 });
    }
    
    // Create a direct Supabase client with service role key for admin operations
    // This approach is appropriate for cron jobs that need to perform admin-level operations
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    const { data: users, error: usersError } = await supabase
      .from('user_onboarding') 
      .select('user_id, alpaca_account_id')
      .not('alpaca_account_id', 'is', null);

    if (usersError) {
      console.error('CRON: Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users', details: usersError.message }, { status: 500 });
    }
    if (!users || users.length === 0) {
      console.log('CRON: No users found for summary generation.');
      return NextResponse.json({ message: 'No users to process' }, { status: 200 });
    }
    console.log(`CRON: Found ${users.length} users to process.`);

    for (const user of users) {
      try {
        console.log(`CRON: Processing summary for user ${user.user_id} (sonar-pro, medium context)...`);
        // Placeholder for fetching actual user portfolio and goals
        // const { portfolioString, userGoals, financialLiteracy } = await fetchUserFinancialContext(user.id);
        const userPortfolio = [ 
          { ticker: 'AAPL', shares: 20 }, { ticker: 'MSFT', shares: 10 }, { ticker: 'TSLA', shares: 5 },
        ];
        const userGoals = 'Long-term growth, focus on tech sector';
        const financialLiteracy = 'intermediate';
        const portfolioString = userPortfolio.map(p => `${p.ticker} (${p.shares} shares)`).join(', ');
        const currentDate = new Date().toISOString().split('T')[0];

        const messages: any[] = [
          {
            role: 'system',
            content: `You are a financial news analyst providing a concise, personalized daily briefing for an investor.
Your summary should be direct, objective, and strictly factual, based on verifiable recent news.
Avoid speculative language or personal opinions. Do NOT use in-text citations like [1] or [Source A].
The user's financial literacy is ${financialLiteracy}. Tailor the language complexity accordingly.
Focus on information directly impacting their investments or stated goals.
Current date: ${currentDate}.

When gathering information for this summary, endeavor to consult at least 4-6 distinct news articles from various reputable sources. (THESE ARTICLES *MUST* BE FROM RECENT AND CREDIBLE SOURCES, SUCH AS WSJ, Bloomberg, Reuters, Financial Times, etc. Specifically search for those and other Wall Street sources)

Your response for the main summary MUST be a single, valid JSON object. ABSOLUTELY NO OTHER TEXT, MARKDOWN, OR EXPLANATIONS BEFORE OR AFTER THE JSON OBJECT.
This JSON object must strictly follow this structure:
{
  "summary_text": "string, exactly two paragraphs.\nParagraph 1: 2-3 sentences discussing yesterday's key market/world news relevant to the user's portfolio/goals. In this paragraph, aim to synthesize information from at least 2-3 distinct articles you consulted.\nParagraph 2: 2-3 sentences discussing what the user should look out for today relevant to their portfolio/goals. In this paragraph, also aim to synthesize information from at least 2-3 distinct articles (can be the same or different from Paragraph 1's sources).\nBoth paragraphs should reference specific companies or market-moving events if applicable. Max 150 words total for both paragraphs."
}
If the portfolio string indicates 'No positions found in portfolio.' or is empty, state that the summary cannot be personalized due to lack of portfolio data and provide a general market overview instead, still aiming for two paragraphs and citing any general market news sources used. You will provide cited URLs separately via the API's citation mechanism.`,
          },
          {
            role: 'user',
            content: `My portfolio consists of: [${portfolioString}].
My investment goals are: [${userGoals}].
Provide a summary covering:
1. What happened yesterday (market and world news) that I need to know for my portfolio and goals?
2. What should I look out for today that is relevant to my portfolio and goals?
3. Reference specific companies or market-moving events.`,
          },
        ];
        
        console.log(`CRON: Sending prompt to Perplexity for user ${user.user_id}...`);
        const requestBody: any = {
          model: 'sonar-pro', 
          messages: messages,
          web_search_options: { 
            search_context_size: "medium" 
          }
        };
        const response: any = await perplexity.chat.completions.create(requestBody);
        console.log(`CRON: Full raw Perplexity API response for user ${user.user_id}:`, JSON.stringify(response, null, 2));

        const rawResponseContent = response.choices[0].message?.content;
        const citationsArray = response.citations;

        if (!rawResponseContent) {
          console.error(`CRON: No main content in Perplexity response for user ${user.user_id}.`);
          continue; 
        }
        const summaryJsonText = extractJsonContent(rawResponseContent);
        if (!summaryJsonText) {
          console.error(`CRON: Failed to extract JSON from Perplexity for user ${user.user_id}. Raw main content: ${rawResponseContent}`);
          continue;
        }
        console.log(`CRON: Extracted summary JSON text for user ${user.user_id}. Length: ${summaryJsonText.length}`);

        let parsedSummaryContent;
        try {
          parsedSummaryContent = JSON.parse(summaryJsonText);
        } catch (e: any) {
          console.error(`CRON: Failed to parse extracted JSON for user ${user.user_id}. Error: ${e.message}. Extracted: ${summaryJsonText}`);
          continue;
        }
        if (!parsedSummaryContent.summary_text) {
          console.error(`CRON: Invalid JSON structure for summary_text after parsing for user ${user.user_id}. Parsed: ${JSON.stringify(parsedSummaryContent)}`);
          continue;
        }

        let enrichedReferencedArticles: any[] = [];
        if (citationsArray && Array.isArray(citationsArray) && citationsArray.length > 0) {
          console.log(`CRON: Enriching ${citationsArray.length} cited articles for user ${user.user_id}...`);
          const articlePromises = citationsArray.map((url: string) => enrichArticleDetails(url));
          enrichedReferencedArticles = (await Promise.all(articlePromises)).filter(article => article !== null);
          console.log(`CRON: Successfully enriched ${enrichedReferencedArticles.length} articles for user ${user.user_id}.`);
        }
        
        const finalResult = {
          user_id: user.user_id,
          summary_text: parsedSummaryContent.summary_text,
          referenced_articles: enrichedReferencedArticles,
          generated_at: new Date().toISOString(),
          perplexity_model: response.model || 'sonar-pro',
        };

        const { error: summaryError } = await supabase
          .from('user_daily_summaries')
          .insert(finalResult);

        if (summaryError) {
          console.error(`CRON: Error saving summary for user ${user.user_id}:`, summaryError);
        } else {
          console.log(`CRON: Successfully saved summary for user ${user.user_id}.`);
        }
      } catch (userError: any) {
        console.error(`CRON: Failed to process summary for user ${user.user_id}:`, userError.message);
        if (userError.response && userError.response.data) {
            console.error("CRON: Perplexity API Error details:", userError.response.data);
        }
      }
    }
    return NextResponse.json({ message: 'Daily summaries generation process (sonar-pro, medium context) completed.' });
  } catch (error: any) {
    console.error('CRON: Cron job failed overall:', error);
    return NextResponse.json({ error: 'Cron job failed', details: error.message }, { status: 500 });
  }
}

// Placeholder function to fetch portfolio - replace with actual implementation
// async function fetchPortfolioForUser(userId: string) {
//   // Your logic to fetch from Supabase table like 'user_portfolios'
//   // const { data, error } = await supabase.from('user_portfolios').select('*').eq('user_id', userId);
//   // return data;
//   return [{ ticker: 'AAPL', shares: 100 }, { ticker: 'GOOGL', shares: 50 }];
// }

// Placeholder function to fetch goals - replace with actual implementation
// async function fetchGoalsForUser(userId: string) {
//   // Your logic to fetch from Supabase table like 'user_investment_goals'
//   // const { data, error } = await supabase.from('user_investment_goals').select('*').eq('user_id', userId);
//   // return data ? data[0]?.goal_description : 'N/A';
//   return 'Long-term growth';
// } 