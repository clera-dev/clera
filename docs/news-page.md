# News Page Implementation Guide

## Overview

The news page provides users with personalized financial news and market updates through several major components:

1. **Daily Portfolio Summary**: A personalized AI-generated summary of news relevant to the user's portfolio.
2. **Referenced Articles**: News articles referenced in the portfolio summary with sentiment highlighting.
3. **Trending Market News**: General market news, refreshed twice daily.
4. **News Watchlist**: Customizable news feed based on user-selected sectors/topics.

## Technical Architecture

### Database Tables

- `user_daily_summaries`: Stores personalized daily summaries for each user
- `cached_trending_news`: Stores trending market news articles
- `trending_news_metadata`: Stores metadata about trending news updates
- `watchlist_cached_news`: Stores news articles for each watchlist category
- `watchlist_news_metadata`: Stores metadata about watchlist news updates

### API Services

- **Perplexity AI**: Used for generating personalized portfolio summaries
  - Model: `sonar-pro` with medium context
  - Environment variable: `PPLX_API_KEY`
  
- **Polygon.io**: Used for fetching sector-specific news
  - Environment variable: `POLYGON_API_KEY`
  - Used for watchlist news with built-in sentiment

### Cron Jobs

| Job | Path | Schedule (UTC) | Purpose |
|-----|------|---------------|---------|
| Update Watchlist News | `/api/cron/update-watchlist-news` | 12:00 daily (0 12 * * *) | Fetches and updates sector-based news |
| Generate Daily Summary | `/api/cron/generate-daily-summary` | 13:00 daily (0 13 * * *) | Creates personalized portfolio summaries |
| Update Trending News | `/api/cron/update-trending-news` | 14:00 & 20:00 daily (0 14,20 * * *) | Refreshes trending market news |

All cron jobs use a `CRON_SECRET` environment variable for authorization and require the following header:
```
Authorization: Bearer ${CRON_SECRET}
```

### Rate Limiting & Performance Considerations

- **Watchlist News**: Processes each sector with 60-second delays to avoid Polygon.io rate limits
- **Daily Summary**: Uses Perplexity with citations that are then enriched with metadata
- **Trending News**: Updated twice daily to keep content fresh

## Running Cron Jobs Manually

To manually trigger any cron job, use curl commands with proper authorization:

#### 1. Update Watchlist News
```bash
curl -X GET "https://[your-domain]/api/cron/update-watchlist-news" \
  -H "Authorization: Bearer [your-cron-secret]"
```

#### 2. Generate Daily Summary
```bash
curl -X GET "https://[your-domain]/api/cron/generate-daily-summary" \
  -H "Authorization: Bearer [your-cron-secret]"
```

#### 3. Update Trending News
```bash
curl -X GET "https://[your-domain]/api/cron/update-trending-news" \
  -H "Authorization: Bearer [your-cron-secret]"
```

Local development example:
```bash
curl -X GET "http://localhost:3000/api/cron/generate-daily-summary" \
  -H "Authorization: Bearer [your-cron-secret]"
```

## UI Components

The news page is structured as follows:

1. **Top Section**
   - Personalized daily summary card
   - Referenced articles with sentiment highlighting (green for positive, red for negative)

2. **Middle Section**
   - Trending market news with source badges

3. **Bottom Section**
   - News watchlist with selectable categories
   - Category badges automatically wrap to multiple rows when many are selected
   - Each category displays its most recent news articles

## Row-Level Security (RLS) Policies

Database tables have the following RLS policies:

- Public read access for all users (authenticated and anonymous)
- Write access restricted to the service role for cron jobs
- Each table has specific policies for SELECT, INSERT, UPDATE, and DELETE operations

## Troubleshooting

- **Empty Watchlist**: If watchlist is empty, the cron job may have failed. Check Vercel logs and manually run the watchlist cron.
- **Outdated Daily Summary**: If summary hasn't updated, manually run the generate-daily-summary cron.
- **Authentication Issues**: Ensure environment variables are correctly set and the CRON_SECRET is valid.

## Deployment Process

When deploying changes:

1. Ensure all environment variables are set in Vercel
2. RLS policies are applied to all tables
3. Watchlist and daily summary crons should be manually run after deployment to immediately populate data
4. Cron schedules in `vercel.json` will maintain automatic updates for subsequent days

