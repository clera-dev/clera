import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBackendConfig, createSecureBackendHeaders } from '@/utils/api/secure-backend-helpers';
import { OpenAI } from 'openai';
import Sentiment from 'sentiment';
import { getLinkPreview, getPreviewFromContent } from 'link-preview-js';
import redisClient from '@/utils/redis-aws';
import { timingSafeEqual } from 'crypto';
import { NewsPersonalizationService } from '@/utils/services/news-personalization';
import { PersonalizationData } from '@/lib/types/personalization';
import { fetchUserPersonalization } from '@/lib/server/personalization-service';

// Extend function execution time to avoid Vercel 15s timeout during first-time summary generation
export const maxDuration = 60;

const sentimentAnalyzer = new Sentiment();

// Redis key constants for user generation locks
const USER_SUMMARY_LOCK_PREFIX = 'news:portfolio:summary:lock:';
const USER_SUMMARY_LOCK_TTL = 300; // 5 minutes in seconds

// Helper function to get the Redis lock key for a user
function getUserLockKey(userId: string): string {
  return `${USER_SUMMARY_LOCK_PREFIX}${userId}`;
}

// Function to acquire a Redis lock for user summary generation
async function acquireUserLock(userId: string): Promise<boolean> {
  const lockKey = getUserLockKey(userId);
  try {
    const result = await redisClient.set(lockKey, Date.now().toString(), 'EX', USER_SUMMARY_LOCK_TTL, 'NX');
    return result === 'OK';
  } catch (redisError) {
    console.warn(`Redis lock acquisition failed for user ${userId}:`, redisError);
    // ARCHITECTURAL FIX: Treat Redis connectivity failures as unlocked state
    // This prevents silent failures that leave data stale when Redis is down
    // Instead of blocking refresh, we allow it to proceed when Redis is unavailable
    return true; // Treat as unlocked to allow refresh to proceed
  }
}

// Function to release a Redis lock
async function releaseUserLock(userId: string): Promise<void> {
  const lockKey = getUserLockKey(userId);
  try {
    await redisClient.del(lockKey);
  } catch (redisError) {
    console.warn(`Redis lock release failed for user ${userId}:`, redisError);
    // Don't throw - lock will expire automatically
  }
}

// Function to check if a user lock exists and is still valid
async function isUserLockActive(userId: string): Promise<boolean> {
  const lockKey = getUserLockKey(userId);
  try {
    const lockExists = await redisClient.exists(lockKey);
    return lockExists === 1;
  } catch (redisError) {
    console.warn(`Redis lock check failed for user ${userId}:`, redisError);
    // ARCHITECTURAL FIX: Treat Redis connectivity failures as no active lock
    // This prevents silent failures that leave data stale when Redis is down
    // Instead of blocking operations, we allow them to proceed when Redis is unavailable
    return false; // Treat as no active lock to allow operations to proceed
  }
}

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
      console.warn('Failed to parse markdown content directly, trying sanitization. Error:', e);
      try {
        const sanitizedJson = sanitizeForJsonParse(potentialJson);
        JSON.parse(sanitizedJson);
        console.log('Successfully parsed markdown content after sanitization.');
        return sanitizedJson;
      } catch (e2) {
        console.warn('Content within markdown block was not valid JSON even after sanitization:', e2, 'Sanitized attempt:', sanitizeForJsonParse(potentialJson), 'Original markdown content:', potentialJson);
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
      console.warn('Failed to parse brace-enclosed substring directly, trying sanitization. Error:', e);
      try {
        const sanitizedJson = sanitizeForJsonParse(potentialJson);
        JSON.parse(sanitizedJson);
        console.log('Successfully parsed brace-enclosed substring after sanitization.');
        return sanitizedJson;
      } catch (e2) {
        console.warn('Failed to parse substring between first/last braces even after sanitization:', e2, 'Sanitized attempt:', sanitizeForJsonParse(potentialJson), 'Original substring:', potentialJson);
      }
    }
  }
  const trimmedResponse = responseText.trim();
  if (firstBrace === -1 || trimmedResponse !== responseText.substring(firstBrace, lastBrace + 1).trim()) {
    try {
      JSON.parse(trimmedResponse);
      return trimmedResponse;
    } catch(e) {
      console.warn('Failed to parse trimmed original string directly, trying sanitization. Error:', e);
      try {
        const sanitizedJson = sanitizeForJsonParse(trimmedResponse);
        JSON.parse(sanitizedJson);
        console.log('Successfully parsed trimmed original string after sanitization.');
        return sanitizedJson;
      } catch (e2) {
       console.error('Could not extract valid JSON content (all methods, including sanitization, failed). Original text:', responseText, 'Sanitized attempt:', sanitizeForJsonParse(trimmedResponse), 'Error:', e2);
       return null;
      }
    }
  }
  if (markdownMatch && markdownMatch[1]) {
     console.error('Could not extract valid JSON content. Markdown was found but failed parsing even after sanitization. Original text:', responseText);
  } else {
     console.error('Could not extract valid JSON content (all methods failed). Original text:', responseText);
  }
  return null;
}

async function enrichArticleDetails(url: string): Promise<any | null> {
  let sourceName = 'unknown';
  let title = '';
  let snippet = '[Snippet Not Available]';
  let sentimentScore = 0;
  let finalUrl = url;
  let shouldDisplay = true;

  // Safely parse and normalize URL (avoid exceptions on invalid strings)
  try {
    const normalized = url && (url.startsWith('http://') || url.startsWith('https://')) ? url : `https://${url}`;
    const parsed = new URL(normalized);
    sourceName = parsed.hostname.replace(/^www\./, '');
    finalUrl = parsed.toString();
  } catch (_) {
    // Keep defaults; downstream logic will mark as not displayable if needed
  }

  try {
    console.log(`enrichArticleDetails: Fetching preview for ${url} using link-preview-js`);
    
    const previewData: any = await getLinkPreview(url, {
      followRedirects: 'follow',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CleraNewsBot/1.0; +http://www.clera.io/bot.html)',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    finalUrl = previewData.url || finalUrl;
    sourceName = new URL(finalUrl).hostname.replace(/^www\./, '');

    if (previewData.title) {
      title = previewData.title;
    } else if (previewData.description && previewData.description.length > 30) {
      title = previewData.description.substring(0, 100) + (previewData.description.length > 100 ? '...' : '');
      console.log(`enrichArticleDetails: Using description as title for ${finalUrl}`);
    }

    if (previewData.description) {
      snippet = previewData.description.substring(0, 300) + (previewData.description.length > 300 ? '...' : '');
    } else {
      console.warn(`enrichArticleDetails: link-preview-js did not return a description for ${finalUrl}. Preview data received: mediaType: ${previewData.mediaType}, contentType: ${previewData.contentType}.`);
    }
    
    if (!title && snippet !== '[Snippet Not Available]' && snippet.length > 30) {
      title = snippet.substring(0, 100) + (snippet.length > 100 ? '...' : '');
      console.log(`enrichArticleDetails: Using snippet as title for ${finalUrl}`);
    }
    
    if (!title) {
      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      title = `${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}: ${formattedDate}`;
      console.log(`enrichArticleDetails: Using date-based title for ${finalUrl}: ${title}`);
    }
    
    const textToAnalyze = title + ' ' + (snippet !== '[Snippet Not Available]' ? snippet : '');

    if (textToAnalyze.trim().length > 10) {
        const sentimentResult = sentimentAnalyzer.analyze(textToAnalyze.trim());
        sentimentScore = sentimentResult.comparative;
        console.log(`enrichArticleDetails: Analyzed sentiment for ${finalUrl}. Score: ${sentimentScore}, Title: "${title}"`);
    } else {
        console.warn(`enrichArticleDetails: Not enough meaningful text for sentiment analysis for ${finalUrl}.`);
    }
    
  } catch (error: any) {
    console.error(`enrichArticleDetails: Error using link-preview-js for ${url}: ${error.name} - ${error.message}. Raw error object:`, JSON.stringify(error));
    
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    title = `${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}: ${formattedDate}`;
    snippet = `Preview generation failed: ${error.message.substring(0,150)}`;
    
    if (process.env.NODE_ENV === 'development' && error.stack) {
      console.error(error.stack);
    }
  }
  
  // Filter out articles with anti-bot protection or empty content
  const isGenericDateTitle = title.includes(sourceName) && title.match(/\w+\s\d+,\s\d{4}$/);
  const hasSubstantialSnippet = snippet !== '[Snippet Not Available]' && snippet.length > 30 && !snippet.startsWith('Preview generation failed');
  const isAntiBot = title.toLowerCase().includes('just a moment') || 
                   title.includes('Cloudflare') || 
                   title.includes('DDoS protection') ||
                   title.includes('Security check');
  
  if (isGenericDateTitle && !hasSubstantialSnippet) {
    shouldDisplay = false;
    console.warn(`enrichArticleDetails: Article from ${sourceName} will not be displayed due to lack of meaningful content.`);
  }
  
  if (isAntiBot) {
    shouldDisplay = false;
    console.warn(`enrichArticleDetails: Article from ${sourceName} will not be displayed due to anti-bot protection: "${title}"`);
    
    // Replace with a better title for debugging purposes
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    title = `${sourceName.charAt(0).toUpperCase() + sourceName.slice(1)}: ${formattedDate}`;
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

async function generateSummaryForUser(userId: string, supabase: any, requestUrl: URL) {
  const perplexity = new OpenAI({
    apiKey: process.env.PPLX_API_KEY,
    baseURL: 'https://api.perplexity.ai',
  });
  let portfolioString: string;
  // Note: Do not fetch backend config here to avoid hard dependency when portfolio integration is disabled.
  
  // Fetch personalization data using direct Supabase access
  const personalizationData = await fetchUserPersonalization(userId, supabase);
  console.log(`Fetched personalization data for user ${userId}:`, personalizationData ? 'Found' : 'Not found');
  
  // Extract personalized values or use defaults
  const userGoals = NewsPersonalizationService.getUserGoalsSummary(personalizationData);
  const financialLiteracy = NewsPersonalizationService.getFinancialLiteracyLevel(personalizationData);

  try {
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', userId)
      .single();
    if (onboardingError || !onboardingData?.alpaca_account_id) {
      console.error(`Error fetching Alpaca account ID for user ${userId}:`, onboardingError || 'No account ID found');
      portfolioString = 'No positions found in portfolio.';
      console.log(`User has no Alpaca account information - using general market overview.`);
    } else {
      const alpacaAccountId = onboardingData.alpaca_account_id;
      console.log(`Fetched Alpaca Account ID ${alpacaAccountId} for user ${userId}`);
      // INDUSTRY-GRADE: call backend directly with JWT + API key headers, no cookie forwarding
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      const secureHeaders = await createSecureBackendHeaders(accessToken);
      // Resolve backend config lazily to avoid hard dependency when portfolio is disabled
      let targetUrl: string | null = null;
      try {
        const backendConfig = getBackendConfig();
        targetUrl = `${backendConfig.url}/api/portfolio/${alpacaAccountId}/positions`;
      } catch (cfgErr) {
        console.warn('Backend config not available; skipping positions fetch and using general market overview.');
      }
      const positionsResponse = targetUrl ? await fetch(targetUrl, {
        method: 'GET',
        headers: secureHeaders,
        cache: 'no-store'
      }) : new Response(null, { status: 204 });
      if (!positionsResponse || !positionsResponse.ok) {
        const errorText = await positionsResponse.text();
        console.error(`Error fetching portfolio positions for user ${userId} (Account ID: ${alpacaAccountId}). Status: ${positionsResponse.status}. Response: ${errorText}`);
        portfolioString = 'No positions found in portfolio.';
        console.log(`Portfolio fetch failed for user - using general market overview.`);
      } else {
        const positionsData: Array<{ symbol: string; qty: string; [key: string]: any }> = await positionsResponse.json();
        if (positionsData && positionsData.length > 0) {
          portfolioString = positionsData.map(p => `${p.symbol} (${p.qty} shares)`).join(', ');
           console.log(`Successfully fetched and processed portfolio for user ${userId}: ${portfolioString}`);
        } else {
          portfolioString = 'No positions found in portfolio.';
          console.log(`No portfolio positions found for user - using general market overview.`);
        }
      }
    }
  } catch (error: any) {
    console.error(`Error fetching or processing portfolio data for user ${userId}:`, error);
    portfolioString = 'No positions found in portfolio.';
    console.log(`System error for user - using general market overview.`);
  }
  return await callPerplexityAndSaveResult(userId, portfolioString, userGoals, financialLiteracy, personalizationData, perplexity, supabase);
}

async function callPerplexityAndSaveResult(
  userId: string, 
  portfolioString: string, 
  userGoals: string, 
  financialLiteracy: string, 
  personalizationData: PersonalizationData | null,
  perplexity: OpenAI,
  supabase: any
) {
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Build base system prompt
  const baseSystemPrompt = `You are a financial news analyst providing a concise, personalized daily briefing for an investor.
Your summary should be direct, objective, and strictly factual, based on verifiable recent news.
Avoid speculative language or personal opinions. Do NOT use in-text citations like [1] or [Source A].
The user's financial literacy is ${financialLiteracy}. Tailor the language complexity accordingly.
Focus on information directly impacting their investments or stated goals.
Current date: ${currentDate}.

When gathering information for this summary, endeavor to consult at least 4-6 distinct news articles from various reputable sources. (MAKE SURE THEY ARE RECENT AND CREDIBLE SOURCES, such as CNBC, Bloomberg, Reuters, Wall Street Journal, etc. Specifically search for those and other Wall Street sources.)

Your response for the main summary MUST be a single, valid JSON object. ABSOLUTELY NO OTHER TEXT, MARKDOWN, OR EXPLANATIONS BEFORE OR AFTER THE JSON OBJECT.
This JSON object must strictly follow this structure:
{
  "summary_text": "string, exactly two paragraphs.\nParagraph 1: 2-3 sentences discussing yesterday's key market/world news relevant to the user's portfolio/goals. In this paragraph, aim to synthesize information from at least 2-3 distinct articles you consulted.\nParagraph 2: 2-3 sentences discussing what the user should look out for today relevant to their portfolio/goals. In this paragraph, also aim to synthesize information from at least 2-3 distinct articles (can be the same or different from Paragraph 1's sources).\nBoth paragraphs should reference specific companies or market-moving events if applicable. Max 150 words total for both paragraphs."
}
If the portfolio string indicates 'No positions found in portfolio.' or is empty, state that the summary cannot be personalized due to lack of portfolio data and provide a general market overview instead, still aiming for two paragraphs and citing any general market news sources used. You will provide cited URLs separately via the API's citation mechanism.`;

  // Enhance the system prompt with personalization context
  const enhancedSystemPrompt = NewsPersonalizationService.enhanceSystemPrompt(baseSystemPrompt, personalizationData);
  
  const messages: any[] = [
    {
      role: 'system',
      content: enhancedSystemPrompt,
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
  
  console.log(`Sending prompt to Perplexity (sonar-pro, medium context) for user ${userId} with portfolio: ${portfolioString}`);
  
  const requestBody: any = {
    model: 'sonar-pro', 
    messages: messages,
    web_search_options: { 
      search_context_size: "medium" 
    }
  };
  const response: any = await perplexity.chat.completions.create(requestBody);
  console.log('Full raw Perplexity API response:', JSON.stringify(response, null, 2));

  const rawResponseContent = response.choices[0].message?.content;
  const citationsArray = response.citations; 
  
  if (!rawResponseContent) {
    console.error(`No main content in Perplexity (sonar-pro) response for user ${userId}`);
    throw new Error('No main content in Perplexity response');
  }
  const summaryJsonText = extractJsonContent(rawResponseContent);
  if (!summaryJsonText) {
    console.error(`Failed to extract valid JSON content from Perplexity (sonar-pro) for user ${userId}. Raw main content was: ${rawResponseContent}`);
    throw new Error('Failed to extract valid JSON content from Perplexity response');
  }
  console.log(`Extracted summary JSON text from Perplexity (sonar-pro) for user ${userId}. Length: ${summaryJsonText.length}`);

  let parsedSummaryContent;
  try {
    parsedSummaryContent = JSON.parse(summaryJsonText);
  } catch (e: any) {
    console.error(`Failed to parse extracted summary_text JSON from Perplexity (sonar-pro) for user ${userId}. Error: ${e.message}. Extracted text: ${summaryJsonText}`);
    throw new Error('Failed to parse summary_text JSON from Perplexity response');
  }
  
  if (!parsedSummaryContent.summary_text) {
    console.error(`Invalid JSON structure for summary_text after parsing (sonar-pro) for user ${userId}. Parsed: ${JSON.stringify(parsedSummaryContent)}`);
    throw new Error('Invalid JSON structure for summary_text from Perplexity after parsing');
  }

  let enrichedReferencedArticles: any[] = [];
  if (citationsArray && Array.isArray(citationsArray) && citationsArray.length > 0) {
    console.log(`Enriching ${citationsArray.length} cited articles for user ${userId}...`);
    const articlePromises = citationsArray.map((url: string) => enrichArticleDetails(url));
    enrichedReferencedArticles = (await Promise.all(articlePromises)).filter(article => article !== null);
    console.log(`Successfully enriched ${enrichedReferencedArticles.length} articles.`);
  }
  
  const finalResult = {
    summary_text: parsedSummaryContent.summary_text,
    referenced_articles: enrichedReferencedArticles,
    generated_at: new Date().toISOString(),
    perplexity_model: response.model || 'sonar-pro',
  };

  console.log(`Attempting to save summary (from sonar-pro) for user ${userId}`);
  const { data: summaryData, error: summaryError } = await supabase
    .from('user_daily_summaries')
    .insert({
      user_id: userId,
      summary_text: finalResult.summary_text,
      referenced_articles: finalResult.referenced_articles, 
      generated_at: finalResult.generated_at,
      perplexity_model: finalResult.perplexity_model,
    })
    .select() 
    .single();

  if (summaryError) {
    console.error(`Error saving summary (from sonar-pro) for user ${userId}:`, summaryError);
    throw new Error(`Failed to save summary: ${summaryError.message}`);
  }
  
  console.log(`Successfully saved summary (from sonar-pro) for user ${userId}:`, summaryData);
  return summaryData;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url); 
  try {
    // Use the existing createClient function from utils/supabase/server
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('User not authenticated in GET /api/news/portfolio-summary:', authError);
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }
    
    console.log(`User ${user.id} authenticated. Fetching summary.`);
    const { data: summary, error: summaryError } = await supabase
      .from('user_daily_summaries')
      .select('summary_text, referenced_articles, generated_at, perplexity_model')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (summaryError) {
      console.error(`Error fetching summary for user ${user.id}:`, summaryError);
      return NextResponse.json({ error: 'Failed to fetch summary', details: summaryError.message }, { status: 500 });
    }

    // Force regeneration via query param (dev/operator override only)
    // Security: Only allow force regeneration for privileged users to prevent cost amplification attacks
    const isForceRequested = requestUrl.searchParams.get('force') === '1' || requestUrl.searchParams.get('regenerate') === '1';
    
    // Secure constant-time comparison to prevent timing side-channel attacks
    const isValidAdminKey = (() => {
      const providedKey = request.headers.get('x-admin-key');
      const expectedKey = process.env.ADMIN_SECRET;
      
      if (!providedKey || !expectedKey) return false;
      if (providedKey.length !== expectedKey.length) return false;
      
      try {
        return timingSafeEqual(
          Buffer.from(providedKey, 'utf8'),
          Buffer.from(expectedKey, 'utf8')
        );
      } catch {
        return false;
      }
    })();
    
    const isPrivilegedAccess = 
      isValidAdminKey || // Internal admin header (secure comparison)
      process.env.NODE_ENV === 'development'; // Allow in development
    const forceRegenerate = isForceRequested && isPrivilegedAccess;

    // Check if summary exists and whether it's stale (older than 24 hours)
    const isStale = forceRegenerate ? true : (!summary ? true : (() => {
      const generatedTime = new Date(summary.generated_at).getTime();
      const now = new Date().getTime();
      const hoursSinceGeneration = (now - generatedTime) / (1000 * 60 * 60);
      
      // Log for transparency
      console.log(`Summary for user ${user.id} was generated ${hoursSinceGeneration.toFixed(2)} hours ago`);
      
      // Normal refresh threshold is 24 hours
      const refreshThreshold = 24; // hours
      
      if (hoursSinceGeneration > refreshThreshold) {
        console.log(`Summary is stale (${hoursSinceGeneration.toFixed(2)} hours old, threshold: ${refreshThreshold} hours)`);
        return true;
      } else {
        console.log(`Summary is still fresh (${hoursSinceGeneration.toFixed(2)} hours old, threshold: ${refreshThreshold} hours)`);
        return false;
      }
    })());
    
    // Check if generation is already in progress for this user using Redis
    const generationInProgress = await isUserLockActive(user.id);
    
    if (isStale && !generationInProgress) {
      console.log(`Portfolio summary for user ${user.id} is ${summary ? 'stale' : 'not found'}, generating a new one...`);
      
      // Try to acquire the lock for this user
      const lockAcquired = await acquireUserLock(user.id);
      if (!lockAcquired) {
        console.log(`Another instance is already generating a summary for user ${user.id}.`);
        // If we have an old summary, return it
        if (summary) {
          return NextResponse.json(summary, { status: 200 });
        }
        return NextResponse.json({ message: 'Summary generation in progress' }, { status: 202 });
      }
      
      try {
        const newSummary = await generateSummaryForUser(user.id, supabase, requestUrl);
        console.log(`Successfully generated new summary for user ${user.id}`);
        return NextResponse.json(newSummary, { status: 200 });
      } catch (genError: any) {
        console.error(`Failed to generate summary for user ${user.id} during on-demand generation:`, genError);
        
        // If we have an old summary, return it even if it's stale
        if (summary) {
          console.log(`Returning stale summary for user ${user.id} due to generation error`);
          return NextResponse.json(summary, { status: 200 });
        }
        return NextResponse.json({ 
          error: 'Failed to generate summary', 
          details: genError.message 
        }, { status: 500 });
      } finally {
        // Always release the lock when we're done, whether successful or error
        await releaseUserLock(user.id);
      }
    } else if (generationInProgress && isStale) {
      console.log(`Summary generation already in progress for user ${user.id}. Returning existing summary.`);
      // If generation is in progress but we have an old summary, return it
      if (summary) {
        return NextResponse.json(summary, { status: 200 });
      }
      return NextResponse.json({ message: 'Summary generation in progress' }, { status: 202 });
    }
    
    console.log(`Returning existing summary for user ${user.id} (generated at ${summary?.generated_at})`);
    return NextResponse.json(summary, { status: 200 });

  } catch (error: any) {
    console.error('Critical error in GET /api/news/portfolio-summary endpoint:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
 