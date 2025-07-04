# Investment Research System Documentation

## Overview

This document provides comprehensive information about the **Investment Research System** built for Clera. The system generates personalized investment recommendations using AI and displays them on both the `/invest` page and `/news` page.

## Current MVP State (Beta Ready)

### What's Built

The system currently includes:

1. **Investment Ideas Section**: 4 personalized investment themes with detailed reports and citations
2. **Stock Picks Section**: 6 curated stock recommendations with rationales  
3. **Market Environment Section**: Current market analysis and risk factors (displayed on News page)

### User Experience

- Clean, production-ready UI without development controls
- Responsive design that adapts to screen sizes
- Loading states and error handling
- Detailed reports in modal dialogs with proper citations
- Last updated timestamps

### Technical Architecture

#### Frontend Components
- `frontend-app/components/invest/InvestmentResearch.tsx` - Main investment content
- `frontend-app/components/news/MarketEnvironment.tsx` - Market analysis for news page

#### Backend API
- `frontend-app/app/api/investment/research/route.ts` - Handles data generation and caching

#### Key Features
- Caching system to avoid repeated API costs
- Perplexity AI integration for content generation
- Citation parsing and numbered reference system
- Responsive grid layouts

## Production Roadmap

### Phase 1: User Personalization System

**Current State**: Uses hardcoded mock user profile
**Production Goal**: Generate unique content for each user based on their actual data

#### Required Changes

1. **User Profile Integration**
   ```typescript
   // Current mock profile (in InvestmentResearch.tsx)
   const MOCK_USER_PROFILE = {
     age: "22-23 (fresh out of college)",
     location: "Newport Beach, California",
     email: "cfmendo1@uci.edu",
     // ... more hardcoded data
   };
   
   // Production: Replace with dynamic user data
   const getUserProfile = async (userId: string) => {
     // Fetch real user data from database
     // Portfolio holdings, risk tolerance, goals, etc.
   };
   ```

2. **Database Schema Additions**
   - User investment preferences
   - Risk tolerance settings
   - Portfolio composition data
   - Investment goals and time horizons

3. **API Updates**
   - Accept user ID parameter
   - Fetch real user portfolio data
   - Generate personalized prompts based on actual holdings

### Phase 2: Automated Weekly Generation

**Goal**: Generate fresh investment research for every user every Monday at 5:30 PM PST

#### Implementation Steps

1. **Create Scheduled Job**
   ```typescript
   // Create: lib/jobs/investment-research-generator.ts
   
   import { getUsersRequiringUpdate } from '@/lib/db/users';
   import { generateInvestmentResearch } from '@/lib/services/investment-research';
   
   export async function generateWeeklyInvestmentResearch() {
     console.log('Starting weekly investment research generation...');
     
     const users = await getUsersRequiringUpdate();
     console.log(`Found ${users.length} users to update`);
     
     for (const user of users) {
       try {
         await generateInvestmentResearch(user.id, {
           force: true,
           reason: 'weekly_update'
         });
         console.log(`Generated research for user ${user.id}`);
         
         // Add delay to avoid rate limits
         await new Promise(resolve => setTimeout(resolve, 2000));
       } catch (error) {
         console.error(`Failed to generate research for user ${user.id}:`, error);
       }
     }
     
     console.log('Weekly investment research generation complete');
   }
   ```

2. **Cron Job Setup (Using Vercel Cron)**
   ```typescript
   // Create: app/api/cron/investment-research/route.ts
   
   import { generateWeeklyInvestmentResearch } from '@/lib/jobs/investment-research-generator';
   import { NextRequest } from 'next/server';
   
   export async function GET(request: NextRequest) {
     // Verify cron authorization
     const authHeader = request.headers.get('authorization');
     if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       return new Response('Unauthorized', { status: 401 });
     }
   
     try {
       await generateWeeklyInvestmentResearch();
       return Response.json({ success: true });
     } catch (error) {
       console.error('Cron job failed:', error);
       return Response.json({ error: 'Failed' }, { status: 500 });
     }
   }
   ```

3. **Vercel Configuration**
   ```json
   // Add to vercel.json
   {
     "crons": [
       {
         "path": "/api/cron/investment-research",
         "schedule": "30 17 * * 1"
       }
     ]
   }
   ```
   - Schedule: `30 17 * * 1` = 5:30 PM UTC every Monday
   - For PST: During PST (UTC-8), this runs at 9:30 AM PST
   - For PDT: During PDT (UTC-7), this runs at 10:30 AM PDT
   - **Adjust to**: `0 1 * * 2` (1:00 AM UTC Tuesday = 5:00 PM PST Monday)

4. **Environment Variables**
   ```bash
   # Add to .env
   CRON_SECRET=your-secure-random-string
   PERPLEXITY_API_KEY=your-perplexity-key
   ```

### Phase 3: Advanced Personalization

#### Enhanced User Profile System

1. **Portfolio Analysis Integration**
   ```typescript
   interface UserPortfolioAnalysis {
     totalValue: number;
     assetAllocation: {
       stocks: number;
       bonds: number;
       etfs: number;
       crypto: number;
     };
     sectorExposure: Record<string, number>;
     riskScore: number;
     diversificationScore: number;
     concentrationRisks: string[];
   }
   ```

2. **Dynamic Prompting System**
   ```typescript
   const generatePersonalizedPrompt = (user: UserProfile, portfolio: UserPortfolioAnalysis) => {
     return `
     Generate investment research for:
     - Age: ${user.age}, Income: ${user.income}
     - Portfolio Value: $${portfolio.totalValue}
     - Current Holdings: ${JSON.stringify(portfolio.assetAllocation)}
     - Risk Tolerance: ${user.riskTolerance}
     - Specific Issues: ${portfolio.concentrationRisks.join(', ')}
     
     Focus on addressing their specific portfolio gaps and risk factors.
     Provide actionable, personalized recommendations.
     `;
   };
   ```

3. **Market Condition Adaptation**
   ```typescript
   const getMarketConditionContext = async () => {
     // Fetch current market indicators
     // VIX levels, sector rotation, economic indicators
     // Adapt recommendations based on current conditions
   };
   ```

## Technical Implementation Details

### Current API Structure

```typescript
// app/api/investment/research/route.ts

// GET: Fetch cached research
export async function GET() {
  // Returns cached data without API cost
  // Falls back to error if no cache exists
}

// POST: Generate new research (costs money)
export async function POST(request: Request) {
  const { userProfile, force } = await request.json();
  
  // Only generates if:
  // 1. No cached data exists, OR
  // 2. force=true is explicitly set
  
  // Calls Perplexity API (~$1-3 per generation)
  // Caches result for 7 days
}
```

### Perplexity Integration

```typescript
const PERPLEXITY_PROMPT = `
You are an expert financial advisor creating personalized investment research.

User Profile:
${JSON.stringify(userProfile, null, 2)}

Generate a comprehensive investment analysis with:

1. **4 Personalized Investment Themes**
   - Title (concise, actionable)
   - Summary (2-3 sentences explaining the opportunity)  
   - Detailed Report (300-500 words with specific analysis and citations)

2. **6 Specific Stock Recommendations**
   - Ticker symbol
   - Company name
   - Rationale (why this fits their profile, 100-150 words)

3. **Current Market Analysis**
   - Current environment assessment
   - Key risk factors to monitor

Response must be valid JSON matching this schema:
{
  "investment_themes": [
    {
      "title": "string",
      "summary": "string", 
      "report": "string with [1] [2] citation format"
    }
  ],
  "stock_picks": [
    {
      "ticker": "string",
      "company_name": "string",
      "rationale": "string"
    }
  ],
  "market_analysis": {
    "current_environment": "string",
    "risk_factors": "string"
  }
}
`;
```

### Caching Strategy

1. **File-based Cache**: `investment-research-cache.json`
2. **Cache Duration**: 7 days
3. **Cache Invalidation**: Manual via API or weekly cron job
4. **Cost Optimization**: Only regenerate when necessary

### Citation System

```typescript
const parseCitationsWithNumbers = (text: string) => {
  const citationNumbers = text.match(/\[(\d+)\]/g);
  if (!citationNumbers) return [];
  
  const uniqueNumbers = Array.from(new Set(citationNumbers.map(match => {
    return parseInt(match.replace(/\[|\]/g, ''));
  }))).sort((a, b) => a - b);
  
  return uniqueNumbers.map(num => ({
    number: num,
    url: CITATIONS[num - 1]
  })).filter(item => item.url);
};
```

## Database Schema Requirements

### Users Table Extensions
```sql
-- Add to existing users table
ALTER TABLE users ADD COLUMN investment_profile JSONB;
ALTER TABLE users ADD COLUMN risk_tolerance INTEGER CHECK (risk_tolerance >= 1 AND risk_tolerance <= 10);
ALTER TABLE users ADD COLUMN investment_goals TEXT[];
ALTER TABLE users ADD COLUMN time_horizon INTEGER; -- years
```

### Investment Research Cache Table
```sql
CREATE TABLE investment_research_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  research_data JSONB NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  generation_cost DECIMAL(5,2), -- Track API costs
  INDEX(user_id),
  INDEX(expires_at)
);
```

### User Portfolio Snapshots
```sql
CREATE TABLE user_portfolio_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  snapshot_date DATE DEFAULT CURRENT_DATE,
  total_value DECIMAL(12,2),
  asset_allocation JSONB,
  holdings JSONB,
  risk_metrics JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(user_id, snapshot_date)
);
```

## Monitoring and Analytics

### Success Metrics to Track
1. **User Engagement**: Click-through rates on investment themes
2. **Content Quality**: User feedback on recommendations
3. **Cost Management**: API usage and generation costs
4. **System Performance**: Cache hit rates, load times

### Logging Implementation
```typescript
const trackInvestmentResearchUsage = async (userId: string, action: string, metadata?: any) => {
  await logEvent('investment_research', {
    userId,
    action, // 'view', 'click_theme', 'click_stock', 'generate'
    timestamp: new Date(),
    metadata
  });
};
```

### Cost Monitoring
```typescript
const trackGenerationCost = async (userId: string, cost: number) => {
  await updateUserMetrics(userId, {
    total_api_cost: { increment: cost },
    last_generation: new Date()
  });
};
```

## Security Considerations

1. **API Key Protection**: Store Perplexity API key securely
2. **Rate Limiting**: Prevent abuse of generation endpoint
3. **User Data Privacy**: Ensure investment data is properly encrypted
4. **Cron Job Security**: Verify authorization headers

## Cost Management

### Current Costs
- **Perplexity API**: ~$1-3 per generation
- **Storage**: Minimal (JSON caching)
- **Compute**: Standard Next.js hosting

### Optimization Strategies
1. **Smart Caching**: Only regenerate when user data significantly changes
2. **Batch Processing**: Generate multiple users in single cron job
3. **Conditional Updates**: Skip generation if market conditions unchanged
4. **User Tiers**: Different update frequencies based on subscription level

## Development vs Production

### Current MVP (Development)
- Single hardcoded user profile
- Manual generation via UI buttons  
- File-based caching
- No user authentication required

### Production Ready
- Database-backed user profiles
- Automated weekly generation
- Database caching with expiration
- Full user authentication integration
- Cost tracking and monitoring
- Error handling and retry logic

## Migration Path

1. **Phase 1 (Week 1-2)**: Database schema and user profile integration
2. **Phase 2 (Week 3)**: Cron job setup and automated generation
3. **Phase 3 (Week 4-5)**: Enhanced personalization and optimization
4. **Phase 4 (Week 6)**: Monitoring, analytics, and cost controls

## Support and Maintenance

### Weekly Tasks
- Monitor generation success rates
- Review API costs
- Check cache hit rates
- Analyze user engagement metrics

### Monthly Tasks  
- Review and update investment themes
- Optimize prompts based on user feedback
- Update citation sources
- Performance optimization

This documentation provides the complete roadmap for transforming the current MVP into a production-ready, personalized investment research system. 