# News Page Feature Enhancement Plan

## 1. Overview of New Features

This document outlines the plan to implement several crucial features for the news page:
1.  **Personalized Daily News Summary:** AI-generated summary of news impacting the user's portfolio.
2.  **Referenced Articles for Summary:** Displaying articles mentioned in the AI summary with sentiment highlighting.
3.  **Trending Market News:** A section for general top market news.
4.  **Enhanced News Watchlist:** News articles filterable by user-selected sectors/topics.

## 2. Feature 1: Personalized Daily News Summary ("News Impacting Your Portfolio")

*   **AI Model:** Perplexity Sonar Reasoning Pro (Medium mode) - Exact model identifier to be confirmed from Perplexity API docs (e.g., `sonar-pro`, `sonar-reasoning-pro`).
*   **Functionality:**
    *   Generate a concise, personalized summary daily at 6:00 AM PST.
    *   Content:
        *   Recap of yesterday's key market/world events relevant to the user's current portfolio and investment goals (long/short term).
        *   Outlook for today: Key things for the user to watch out for.
        *   Personalization will adapt to user's investment horizon, portfolio, and (future) financial literacy level.
*   **Data Flow (Backend):**
    1.  **Scheduled Cron Job (Vercel):** Runs daily at 6:00 AM PST (14:00 UTC, assuming PST is UTC-8 and no DST, or adjust as needed. Cron uses UTC. `0 14 * * *`).
    2.  **Fetch User Data:** The cron job (a Next.js API route) will need to securely access the logged-in user's data:
        *   Current portfolio (list of tickers, holdings).
        *   Investment goals (e.g., long-term growth, short-term income).
        *   (Future) Financial literacy score.
        *   *Question: How is this user data currently stored and accessible to a backend serverless function? (e.g., Supabase DB)*
    3.  **Construct Perplexity Prompt:** Create a detailed prompt for the Perplexity API, including the fetched user data as context.
        *Example Prompt Idea:*
        ```
        System: You are a financial news analyst providing a concise, personalized daily briefing for an investor. Be precise. Focus on information directly impacting their investments or stated goals. Current date: [YYYY-MM-DD].
        User: My portfolio consists of: [AAPL (20 shares), MSFT (10 shares), TSLA (5 shares)]. My investment goals are: [Long-term growth, focus on tech sector].
        Provide a summary (max 150 words) covering:
        1. What happened yesterday (market and world news) that I need to know for my portfolio and goals?
        2. What should I look out for today that is relevant to my portfolio and goals?
        3. Reference specific companies or market-moving events.
        If possible, list up to 3-4 key news article URLs that support your summary points.
        ```
    4.  **Call Perplexity API:** Send the prompt to the `/chat/completions` endpoint.
        *   Request structured output if possible (e.g., JSON with `summary_text` and `referenced_articles: [{title, url, source}]`). Investigate `response_format` field in Perplexity API.
    5.  **Parse Response & Store:**
        *   Extract the summary text.
        *   Extract referenced article URLs/details (if provided by Perplexity).
        *   Store in a database (e.g., Supabase `user_daily_summaries` table).
*   **Backend Components:**
    *   **Cron Job:** Next.js API route in `frontend-app/app/api/cron/generate-daily-summary/route.ts`.
        *   This route will need to be protected (e.g., Vercel's cron job protection, or a secret passed in the request).
    *   **Perplexity Service:** A new Python module, potentially in `backend/clera_agents/perplexity_service.py` (or a new `backend/services/` directory). This service will handle API calls to Perplexity.
        *   Needs secure API key management (environment variables).
    *   **Database Interaction:** Logic to fetch user data and save summaries (potentially using Supabase client).
*   **Frontend (NewsPage.tsx):**
    *   Fetch the latest daily summary for the logged-in user from a new API endpoint (e.g., `/api/news/portfolio-summary`).
    *   Display the summary text.
*   **Open Questions/Research:**
    *   Confirm exact Perplexity model name for "Sonar Reasoning Pro (Medium)".
    *   Perplexity API: Capabilities for returning structured JSON with article references.
    *   Secure access to user portfolio/goals data from the cron job.
    *   How to handle cases where Perplexity summary generation fails? (Fallback, logging).
    *   How to make the cron job user-specific if Vercel cron jobs are global? The cron job would likely iterate through active users or be triggered per user if that's feasible/necessary (might be too complex for a simple cron). A single cron that prepares summaries for all opted-in users might be more scalable. Or, the summary is generated on-demand when the user first visits the page after 6 AM, with caching. *Initial thought: The cron prepares for all users who have portfolios.*

## 3. Feature 2: Referenced Articles for Daily Summary

*   **Functionality:**
    *   Display a list of 4-6 key news articles that support/are referenced by the Perplexity-generated summary.
    *   Sentiment Highlighting:
        *   Green background/border for positive sentiment.
        *   Red background/border for negative sentiment.
        *   Neutral or no specific highlighting for neutral.
*   **Data Source & Sentiment:**
    *   **Option A (Perplexity provides article URLs):**
        1.  Perplexity API response includes URLs/titles of referenced articles.
        2.  For each URL, fetch more details if needed (e.g., to get a snippet or confirm source).
        3.  **Sentiment:**
            *   If Perplexity provides sentiment per article: Use that.
            *   If not: Use Polygon.io News API (`/v2/reference/news` with `ticker` if article is about a specific company, or by searching article title/keywords if possible) to fetch the article and its sentiment (`insights` field). This might be tricky if the article is general.
            *   Alternative: A generic sentiment analysis model for the article title/snippet if other methods fail.
    *   **Option B (Perplexity mentions topics/companies, not specific URLs):**
        1.  Parse company names or key events from Perplexity's summary.
        2.  Query Polygon.io News API for recent articles related to these companies/events.
        3.  Select the top 3-4 most relevant articles.
        4.  Use Polygon.io's `insights` for sentiment. This seems more robust for sentiment.
    *   **Chosen Approach (Initial):** Aim for Perplexity to provide URLs. If not, fall back to Option B, which aligns well with using Polygon.io for news and its built-in sentiment.
*   **Backend:**
    *   If Perplexity provides URLs, the cron job (Feature 1) would also fetch these articles via Polygon.io (if not already detailed by Perplexity) to get sentiment and store: `article_id`, `summary_id`, `title`, `url`, `source_name`, `published_at`, `sentiment_score`, `sentiment_reasoning`.
*   **Frontend (`NewsPage.tsx` & New Components):**
    *   Fetch the list of linked/referenced articles along with the summary.
    *   Create a new component, e.g., `PortfolioNewsItem.tsx`, to display each article.
    *   Apply conditional styling based on the `sentiment_score`.
    *   The `getSourceColor` and `getSourceInitials` functions from `NewsPage.tsx` can be reused/adapted.
*   **Open Questions/Research:**
    *   Reliability of Perplexity providing usable article URLs.
    *   Strategy for matching Perplexity's general statements to specific articles if URLs aren't provided.
    *   Polygon.io's news sentiment accuracy and coverage.

## 4. Feature 3: Trending Market News

*   **Functionality:**
    *   Display a list of general top market news (not personalized).
    *   Fetched efficiently and cached to reduce API calls.
*   **Data Source Candidates & Chosen API:**
    *   **Alpha Vantage API (`function=NEWS_SENTIMENT`):**
        *   *Pros:* Offers direct filtering by predefined `topics` (e.g., "financial_markets", "economy_macro"), which is suitable for general news. Crucially, it includes built-in `overall_sentiment_score` and `overall_sentiment_label` for each article, and even `ticker_sentiment`. Provides `summary`, `url`, `source`, `time_published`, `image`.
        *   *Cons:* Relies on a predefined list of topics; flexibility depends on how well these align with desired "trending" categories. API aesthetics/perceived modernity was a minor user concern, but functionality is key.
        *   *Strategy:* Strong primary candidate due to the combination of topic filtering and built-in sentiment, simplifying backend processing.
    *   **Benzinga News API (`GET /api/v2/news`):**
        *   *Pros:* Offers `channels` (e.g., "Top Stories") or flexible keyword-based `topics` search. Good metadata.
        *   *Cons:* No built-in sentiment analysis, requiring an extra step.
        *   *Strategy:* Good alternative if Alpha Vantage topics are too restrictive or sentiment quality is an issue. Simpler for fetching if sentiment is not a hard requirement for this section.
    *   **Polygon.io (`/v2/reference/news`):**
        *   *Pros:* Includes built-in sentiment analysis (`insights` field).
        *   *Cons:* Primarily ticker-based, requiring querying for major market indices/companies to simulate general news.
        *   *Strategy:* Fallback, particularly if its sentiment quality is superior and essential.
    *   **Decision (Updated):** Prioritize **Alpha Vantage API** for fetching trending news due to its topic filtering and built-in sentiment. Evaluate topic coverage.
*   **Backend:**
    *   **Scheduled Cron Job (Vercel):** Runs periodically (e.g., every 1-2 hours).
        *   Path: `frontend-app/app/api/cron/update-trending-news/route.ts`.
    *   **News Fetching Logic (Alpha Vantage):**
        1.  Query Alpha Vantage `NEWS_SENTIMENT` function using appropriate `topics` (e.g., `financial_markets`, `economy_macro`, or a combination).
        2.  Use `sort=LATEST` (default) and `limit` (e.g., 10-20).
        3.  Extract relevant fields: `title`, `url`, `summary`, `time_published`, `authors` (as source), `banner_image`, `overall_sentiment_score`, `overall_sentiment_label`, `source` (original news source like Zacks, Benzinga etc.).
    *   **Caching:**
        *   Store fetched news in a database table (e.g., `cached_trending_news`) with a timestamp and extracted fields.
        *   The API endpoint will serve from this cache.
        *   The cron job updates this table.
    *   **API Endpoint:** `frontend-app/app/api/news/trending` to retrieve cached trending news.
*   **Frontend (`NewsPage.tsx` & New Components):**
    *   Fetch data from `/api/news/trending`.
    *   Display in the "Trending Market News" card.
    *   Adapt `TrendingNewsItem.tsx`. Use `source` from Alpha Vantage response for display. `getSourceColor` and `getSourceInitials` can be applied to this source.
*   **Open Questions/Research:**
    *   Evaluate Alpha Vantage's predefined `topics` for suitability for "general market news."
    *   Quality and granularity of Alpha Vantage sentiment scores.
    *   Refresh rate for the cron job and Alpha Vantage API rate limits/pricing for chosen frequency.
    *   Cache invalidation/update strategy.

## 5. Feature 4: Enhanced News Watchlist

*   **Functionality:**
    *   Users select sectors/topics (e.g., "tech", "finance", "crypto") they are interested in.
    *   Display ~10 most recent news articles for each selected/active topic.
    *   Data refreshed daily.
*   **Data Source Candidates & Chosen API:**
    *   **Alpha Vantage API (`function=NEWS_SENTIMENT`):**
        *   *Pros:* Excellent fit. Directly supports filtering by `topics` (e.g., `technology`, `finance`, `blockchain` for crypto). Includes built-in sentiment for each article.
        *   *Cons:* Dependent on Alpha Vantage's predefined topic list aligning with the application's desired watchlist categories.
        *   *Strategy:* Primary candidate. Map application watchlist categories to Alpha Vantage `topics`.
    *   **Benzinga News API (`GET /api/v2/news`):**
        *   *Pros:* Flexible `channels` or keyword-based `topics` search.
        *   *Cons:* No built-in sentiment, requiring an extra step.
        *   *Strategy:* Alternative if Alpha Vantage topics are not granular enough or if its sentiment is problematic.
    *   **Polygon.io News API (`/v2/reference/news`):**
        *   *Pros:* Built-in sentiment.
        *   *Cons:* Requires maintaining a sector-to-ticker mapping, less direct for topic-based news.
        *   *Strategy:* Fallback option.
    *   **Decision (Updated):** Prioritize **Alpha Vantage API** for its direct topic filtering and included sentiment analysis. Verify topic mapping.
*   **Backend:**
    *   **Sector/Topic Mapping (Alpha Vantage):**
        *   Define mappings from your application's watchlist categories (e.g., "tech", "finance", "crypto", "commodities", "globalMarkets") to specific Alpha Vantage `topics` values (e.g., `technology`, `finance`, `blockchain`, `energy_transportation`, `economy_macro`).
        *   Store this mapping in a configuration file or a simple DB table.
    *   **Scheduled Cron Job (Vercel):** Runs daily (e.g., early morning).
        *   Path: `frontend-app/app/api/cron/update-watchlist-news/route.ts`.
    *   **News Fetching & Storage (Alpha Vantage):**
        1.  For each defined watchlist category in your application:
            *   Get its corresponding Alpha Vantage `topics` query string.
            *   Query Alpha Vantage `NEWS_SENTIMENT` for the latest N articles (e.g., 10-15) using `sort=LATEST`.
        2.  Store articles in a database table (e.g., `watchlist_cached_news`) with: `article_id (PK)`, `alpha_vantage_id (unique, if available, or use URL)`, `title`, `url`, `summary`, `image_url`, `source_name (authors/source)`, `published_at`, `overall_sentiment_score`, `overall_sentiment_label`, `watchlist_category_tag`.
        3.  The cron job will refresh these articles daily.
    *   **API Endpoint:** `frontend-app/app/api/news/watchlist?category=tech`.
        *   This endpoint will query the `watchlist_cached_news` table.
*   **Frontend (`NewsPage.tsx`):**
    *   The existing UI for selecting watchlist topics is a good base.
    *   Modify data fetching to call the new `/api/news/watchlist` endpoint, passing the application's category (backend maps this to Alpha Vantage topic).
    *   The `watchlistNews` state will be populated. Sentiment data from Alpha Vantage can be used if desired for UI distinctions (though current UI for watchlist doesn't show sentiment).
    *   The "Search industries/sectors" to add to watchlist:
        *   Should search a predefined list of supportable application categories that have Alpha Vantage topic mappings.
*   **Open Questions/Research:**
    *   Confirm that Alpha Vantage's `topics` list (Blockchain, Earnings, IPO, Mergers & Acquisitions, Financial Markets, Economy - Fiscal Policy, Economy - Monetary Policy, Economy - Macro/Overall, Energy & Transportation, Finance, Life Sciences, Manufacturing, Real Estate & Construction, Retail & Wholesale, Technology) adequately covers the desired watchlist categories ("tech", "finance", "crypto", "commodities", "globalMarkets"). Some mappings might be imperfect (e.g. "commodities" to "Energy & Transportation" or a broader economic topic).
    *   Quality and usefulness of Alpha Vantage sentiment for watchlist items.
    *   Alpha Vantage API rate limits for daily refresh of multiple categories.

## 6. Cross-Cutting Concerns & General Architecture

*   **API Key Management:**
    *   All API keys (Perplexity, Polygon.io) must be stored securely as environment variables on Vercel.
    *   Backend services/agents in Python will access these via `os.environ`.
*   **Database Schema (Supabase/Postgres - Preliminary Ideas):**
    *   `users`: (exists, assuming Supabase auth) `id`, `email`, ...
    *   `user_portfolios`: `user_id (FK)`, `ticker`, `shares`, ... (How is this currently stored?)
    *   `user_investment_goals`: `user_id (FK)`, `goal_description`, `horizon` (short/long-term), ...
    *   `user_daily_summaries`: `id (PK)`, `user_id (FK)`, `summary_text`, `generated_at (timestamp)`, `perplexity_request_id (optional)`.
    *   `news_articles`: `id (PK)`, `external_api_id (e.g., Polygon ID)`, `title`, `article_url`, `source_name`, `publisher_logo_url (optional)`, `published_utc`, `description_snippet`, `sentiment_score (e.g., positive/negative/neutral)`, `sentiment_reasoning (text)`. (This could be a central table for all news).
    *   `summary_referenced_articles`: `summary_id (FK to user_daily_summaries)`, `article_id (FK to news_articles)`.
    *   `trending_news_cache`: `article_id (FK to news_articles)`, `cached_at (timestamp)`, `rank (optional)`.
    *   `watchlist_definitions`: `id (PK)`, `topic_tag (e.g., 'tech', 'finance')`, `display_name`.
    *   `watchlist_topic_ticker_map`: `topic_id (FK to watchlist_definitions)`, `ticker_symbol`.
    *   `watchlist_cached_news`: `article_id (FK to news_articles)`, `topic_tag`, `cached_at`. (Stores the chosen 10 articles per topic).
*   **Error Handling & Logging:**
    *   Implement robust error handling in all API calls and cron jobs.
    *   Use Vercel's logging for serverless functions/cron jobs.
    *   Consider a simple status update in the DB if a cron job fails for a user/task.
*   **Backend Structure:**
    *   Next.js API Routes (`frontend-app/app/api/`): For frontend-facing endpoints and cron job handlers. These can call Python backend services if complex logic is needed.
    *   Python Services (`backend/clera_agents/` or `backend/services/`):
        *   `perplexity_service.py`: Interacts with Perplexity API.
        *   `news_api_service.py`: Interacts with Polygon.io (or other news APIs).
        *   `database_service.py`: (Optional) Wrappers for common DB operations.
        *   These Python services might be invoked from Next.js API routes using a simple execution model (e.g., if Vercel supports Python functions directly invoked, or via an internal HTTP call if the Python services are deployed as separate functions/endpoints, though this adds complexity. Simpler if Next.js API routes can directly use Supabase client and call Perplexity/Polygon).
        *   *Clarification: Current setup seems to be Next.js frontend. If Python backend agents are separate, how do they communicate? If it's all within Next.js API routes (TypeScript/JavaScript), then direct SDK usage for Perplexity/Polygon is preferred.* Assuming for now that API routes in Next.js will handle most logic, using SDKs. If heavy Python logic is needed, we might need to stand up Python serverless functions.
*   **Frontend Structure:**
    *   Modify `NewsPage.tsx` to integrate new data.
    *   New components in `frontend-app/components/news/` (e.g., `PortfolioSummary.tsx`, `PortfolioNewsItem.tsx`, `TrendingNewsItem.tsx`).

## 7. Phased Implementation Plan (Suggestion)

1.  **Phase 1: Setup & Trending News (Less Dependency)**
    *   Setup Polygon.io API access.
    *   Implement "Trending Market News" (Feature 3):
        *   Backend cron job to fetch from Polygon.io (using index/major tickers).
        *   Caching mechanism (DB table).
        *   API endpoint to serve cached news.
        *   Frontend integration.
2.  **Phase 2: Watchlist News**
    *   Implement "Enhanced News Watchlist" (Feature 4):
        *   Define initial sector-to-ticker mappings.
        *   Backend cron job to fetch and store watchlist news per sector.
        *   API endpoint.
        *   Frontend integration.
3.  **Phase 3: Perplexity Summary & Referenced Articles (Most Complex)**
    *   Setup Perplexity API access.
    *   Develop the backend cron job for "Personalized Daily News Summary" (Feature 1).
        *   Focus on prompt engineering.
        *   Secure user data access.
        *   Storing summaries.
    *   Implement display of referenced articles and sentiment (Feature 2).
    *   Frontend integration for summary and articles.
4.  **Phase 4: Refinement & Future Considerations**
    *   Refine personalization for Perplexity (financial literacy).
    *   Review and update sector-ticker mappings.
    *   Monitor API usage and costs.

This detailed plan should provide a solid foundation for implementing the requested features.
The next step would be to start with Phase 1 after any clarifications.

