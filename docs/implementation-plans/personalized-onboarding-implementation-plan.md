# Personalized Onboarding Implementation Plan

## Project Overview

**Goal**: Add a personalization questionnaire as the first step in the onboarding process to customize the user experience and AI agent responses. This will collect non-legal personal information before the existing legal onboarding steps.

**Timeline**: This is a major feature requiring careful implementation to maintain production-grade quality and avoid breaking existing functionality.

---

## 🔍 Current Architecture Analysis

### Existing Onboarding Flow
```
Current: welcome → contact → personal → financial → disclosures → agreements → loading → success
New:     personalization → welcome → contact → personal → financial → disclosures → agreements → loading → success
```

**Key Files:**
- `frontend-app/components/onboarding/OnboardingFlow.tsx` - Main flow controller
- `frontend-app/components/onboarding/WelcomePage.tsx` - Current welcome page
- `frontend-app/lib/types/onboarding.ts` - Type definitions
- `frontend-app/app/actions.ts` - Server actions for data saving

### Chat System Architecture
**Message Flow:**
1. Frontend Chat Component → `/api/chat/route.ts` 
2. API Route → Backend `/api/chat-with-account`
3. Backend → LangGraph Agent with config: `{user_id, account_id}`

**Key Injection Points:**
- Frontend: Where message is constructed before sending
- Backend: Where LangGraph config is built (potential context injection)

### Database Pattern
- Uses Supabase PostgreSQL with Row-Level Security
- JSONB columns for flexible data storage
- TypeScript enums for consistent data types
- Separate tables for different concerns (user_onboarding, user_bank_connections, etc.)

---

## 📋 Implementation Plan

### Phase 1: Database Schema & Types

#### 1.1 Create user_personalization Table
```sql
-- Create user_personalization table
CREATE TABLE public.user_personalization (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Basic Info
  first_name TEXT NOT NULL,
  
  -- Investment Goals (multiple selection)
  investment_goals TEXT[] NOT NULL DEFAULT '{}',
  
  -- Risk Tolerance
  risk_tolerance TEXT NOT NULL CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
  
  -- Investment Timeline
  investment_timeline TEXT NOT NULL CHECK (investment_timeline IN ('less_than_1_year', '1_to_3_years', '3_to_5_years', '5_to_10_years', '10_plus_years')),
  
  -- Experience Level
  experience_level TEXT NOT NULL CHECK (experience_level IN ('no_experience', 'some_familiarity', 'comfortable', 'professional')),
  
  -- Monthly Investment Goal
  monthly_investment_goal INTEGER NOT NULL DEFAULT 250, -- in dollars
  
  -- Market Interests (multiple selection)
  market_interests TEXT[] NOT NULL DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT user_personalization_pkey PRIMARY KEY (id),
  CONSTRAINT user_personalization_user_id_key UNIQUE (user_id),
  CONSTRAINT user_personalization_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX idx_user_personalization_user_id ON public.user_personalization USING btree (user_id) TABLESPACE pg_default;

-- Row Level Security
ALTER TABLE public.user_personalization ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own personalization data" ON public.user_personalization
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own personalization data" ON public.user_personalization
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own personalization data" ON public.user_personalization
  FOR UPDATE USING (auth.uid() = user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_personalization_updated_at 
  BEFORE UPDATE ON public.user_personalization 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 1.2 TypeScript Type Definitions
Create `frontend-app/lib/types/personalization.ts`:

```typescript
// Investment Goals Enum
export enum InvestmentGoal {
  RETIREMENT = "retirement",
  HOUSE = "house", 
  BIG_PURCHASE = "big_purchase",
  EXTRA_INCOME = "extra_income",
  PAY_OFF_DEBT = "pay_off_debt",
  FOR_FUN = "for_fun",
  INHERITANCE = "inheritance",
  TRAVEL = "travel",
  NOT_SURE = "not_sure"
}

// Risk Tolerance Enum
export enum RiskTolerance {
  CONSERVATIVE = "conservative",
  MODERATE = "moderate", 
  AGGRESSIVE = "aggressive"
}

// Investment Timeline Enum
export enum InvestmentTimeline {
  LESS_THAN_1_YEAR = "less_than_1_year",
  ONE_TO_THREE_YEARS = "1_to_3_years",
  THREE_TO_FIVE_YEARS = "3_to_5_years", 
  FIVE_TO_TEN_YEARS = "5_to_10_years",
  TEN_PLUS_YEARS = "10_plus_years"
}

// Experience Level Enum
export enum ExperienceLevel {
  NO_EXPERIENCE = "no_experience",
  SOME_FAMILIARITY = "some_familiarity",
  COMFORTABLE = "comfortable", 
  PROFESSIONAL = "professional"
}

// Market Interests Enum
export enum MarketInterest {
  GLOBAL_POLITICS = "global_politics",
  TRADE = "trade",
  STOCKS = "stocks",
  BONDS = "bonds", 
  ECONOMY = "economy",
  TECHNOLOGY = "technology",
  HEALTHCARE = "healthcare",
  UTILITY = "utility",
  MATERIALS = "materials",
  CONSUMER_STAPLES = "consumer_staples",
  CONSUMER_DISCRETIONARY = "consumer_discretionary",
  INDUSTRIALS = "industrials",
  COMMUNICATION_SERVICES = "communication_services",
  ENERGY = "energy",
  FINANCIALS = "financials",
  REAL_ESTATE = "real_estate"
}

// Main personalization data interface
export interface PersonalizationData {
  firstName: string;
  investmentGoals: InvestmentGoal[];
  riskTolerance: RiskTolerance;
  investmentTimeline: InvestmentTimeline;
  experienceLevel: ExperienceLevel;
  monthlyInvestmentGoal: number;
  marketInterests: MarketInterest[];
}

// Helper type for descriptions
export const INVESTMENT_GOAL_DESCRIPTIONS: Record<InvestmentGoal, string> = {
  [InvestmentGoal.RETIREMENT]: "Saving for retirement",
  [InvestmentGoal.HOUSE]: "Buying a house",
  [InvestmentGoal.BIG_PURCHASE]: "Saving for a big purchase", 
  [InvestmentGoal.EXTRA_INCOME]: "To generate extra income every month",
  [InvestmentGoal.PAY_OFF_DEBT]: "To help pay off debt every month",
  [InvestmentGoal.FOR_FUN]: "Investing for fun",
  [InvestmentGoal.INHERITANCE]: "Leave an inheritance",
  [InvestmentGoal.TRAVEL]: "Travel",
  [InvestmentGoal.NOT_SURE]: "Not sure yet"
};

export const RISK_TOLERANCE_DESCRIPTIONS: Record<RiskTolerance, string> = {
  [RiskTolerance.CONSERVATIVE]: "I would reduce my investments to limit further losses",
  [RiskTolerance.MODERATE]: "I would keep my investments and wait for the market to recover", 
  [RiskTolerance.AGGRESSIVE]: "I would increase my investments to take advantage of lower prices"
};

export const INVESTMENT_TIMELINE_DESCRIPTIONS: Record<InvestmentTimeline, string> = {
  [InvestmentTimeline.LESS_THAN_1_YEAR]: "Less than 1 year",
  [InvestmentTimeline.ONE_TO_THREE_YEARS]: "1-3 years",
  [InvestmentTimeline.THREE_TO_FIVE_YEARS]: "3-5 years",
  [InvestmentTimeline.FIVE_TO_TEN_YEARS]: "5-10 years", 
  [InvestmentTimeline.TEN_PLUS_YEARS]: "10+ years"
};

export const EXPERIENCE_LEVEL_DESCRIPTIONS: Record<ExperienceLevel, string> = {
  [ExperienceLevel.NO_EXPERIENCE]: "I have no experience with investing",
  [ExperienceLevel.SOME_FAMILIARITY]: "I have some familiarity with it but don't really know how it works",
  [ExperienceLevel.COMFORTABLE]: "I have been investing for a while and feel comfortable talking about my investments and the market",
  [ExperienceLevel.PROFESSIONAL]: "I work in finance or investing"
};

export const MARKET_INTEREST_DESCRIPTIONS: Record<MarketInterest, string> = {
  [MarketInterest.GLOBAL_POLITICS]: "Global politics",
  [MarketInterest.TRADE]: "Trade", 
  [MarketInterest.STOCKS]: "Stocks",
  [MarketInterest.BONDS]: "Bonds",
  [MarketInterest.ECONOMY]: "Economy",
  [MarketInterest.TECHNOLOGY]: "Technology",
  [MarketInterest.HEALTHCARE]: "Healthcare", 
  [MarketInterest.UTILITY]: "Utility",
  [MarketInterest.MATERIALS]: "Materials",
  [MarketInterest.CONSUMER_STAPLES]: "Consumer staples",
  [MarketInterest.CONSUMER_DISCRETIONARY]: "Consumer discretionary",
  [MarketInterest.INDUSTRIALS]: "Industrials",
  [MarketInterest.COMMUNICATION_SERVICES]: "Communication services",
  [MarketInterest.ENERGY]: "Energy",
  [MarketInterest.FINANCIALS]: "Financials",
  [MarketInterest.REAL_ESTATE]: "Real estate"
};
```

### Phase 2: Updated Onboarding Flow

#### 2.1 Update OnboardingFlow.tsx
Key changes needed:
1. Add "personalization" step to ONBOARDING_STEPS array at index 0
2. Shift all existing step indices by 1 
3. Add new PersonalizationStep component
4. Update progress calculation
5. Add personalization data to state management

```typescript
// Updated ONBOARDING_STEPS
const ONBOARDING_STEPS: Step[] = [
  "personalization", // NEW STEP
  "welcome",
  "contact", 
  "personal",
  "financial",
  "disclosures",
  "agreements",
  "loading",
  "success"
];

// Add to StepIndex enum
enum StepIndex {
  Personalization = 0, // NEW
  Welcome = 1,        // Shifted +1
  Contact = 2,        // Shifted +1
  // ... all others shift +1
}
```

#### 2.2 Create PersonalizationStep Component
Create `frontend-app/components/onboarding/PersonalizationStep.tsx`:

Mobile-first design with:
- Name input field
- Card-based goal selection (max 3)
- Risk tolerance with emoji indicators
- Timeline slider
- Experience level cards
- Monthly investment range slider  
- Market interests grid (max 5)

#### 2.3 Update WelcomePage Component
Update text to:
- "Hey there! I'm Clera. I'm your personal investment advisor here to help you with anything investment related. But before we start with that, let's get your account set up."
- Update step descriptions to show 4 steps instead of 3
- Use personalized greeting: "It's nice to meet you {firstName}"

### Phase 3: AI Agent Context Injection

#### 3.1 Create Personalization Context Service
Create `frontend-app/utils/services/personalization-service.ts`:

```typescript
export class PersonalizationService {
  static async getPersonalizationContext(userId: string): Promise<string> {
    // Fetch personalization data from Supabase
    // Format into structured prompt context
    // Return formatted string for AI agent
  }
  
  static formatPersonalizationPrompt(data: PersonalizationData): string {
    // Convert data into natural language context
    // E.g., "The user's investment goals include saving for retirement and buying a house. 
    //       They have a moderate risk tolerance and plan to invest for 5-10 years..."
  }
}
```

#### 3.2 Update Chat Message Construction
**Option A: Frontend Injection (Recommended)**
- Modify chat components to fetch personalization data
- Append context to user messages before sending
- Maintains existing backend architecture

**Option B: Backend Injection** 
- Modify backend LangGraph config to include personalization
- Fetch data server-side and inject into agent context
- More secure but requires backend changes

#### 3.3 Context Template Design
```typescript
const PERSONALIZATION_TEMPLATE = `
User Context:
- Name: {firstName}
- Investment Goals: {goals}
- Risk Tolerance: {riskTolerance} 
- Investment Timeline: {timeline}
- Experience Level: {experienceLevel}
- Monthly Investment Budget: ${monthlyInvestmentRange}
- Market Interests: {marketInterests}

Please provide personalized advice based on this context. Tailor your recommendations to their goals, risk tolerance, and experience level.

User Message: {actualUserMessage}
`;
```

### Phase 4: Dashboard Goals Section

#### 4.1 Create Goals Management Component
Create `frontend-app/components/dashboard/GoalsSection.tsx`:

Features:
- Display current investment goals as cards
- Edit functionality with modal/inline editing
- Add/remove goals
- Progress tracking (future enhancement)

#### 4.2 Update Dashboard Layout
Add goals section to existing dashboard grid layout:
```tsx
{/* Row 3: Goals Section */}
<div className="grid grid-cols-1 gap-6">
  <GoalsSection userId={user.id} />
</div>
```

#### 4.3 Goals Update API Routes
Create `/api/personalization/goals/route.ts`:
- GET: Fetch current goals
- PUT: Update goals
- Proper authentication and validation

### Phase 5: Mobile Optimization

#### 5.1 Mobile PersonalizationStep Design
- Single question per screen on mobile
- Swipe/tap navigation between questions
- Large touch targets for cards and sliders
- Responsive typography and spacing

#### 5.2 Mobile Dashboard Goals
- Collapsible goals section 
- Horizontal scrolling for goal cards
- Touch-friendly edit interface

#### 5.3 Mobile Chat Context
- Ensure personalization context doesn't break mobile chat
- Test message length limits
- Optimize for mobile performance

### Phase 6: Data Migration & Compatibility

#### 6.1 Existing User Handling
For users who have already completed onboarding:
- Create migration script to populate default personalization data
- Show personalization setup prompt on first dashboard visit
- Allow retroactive personalization completion

#### 6.2 Onboarding State Management
- Update middleware to handle new personalization step
- Ensure progress tracking works correctly
- Handle edge cases (partial completion, browser refresh)

### Phase 7: Testing Strategy

#### 7.1 Unit Tests
- PersonalizationStep component rendering
- Form validation and submission
- Data type conversions
- Personalization service methods

#### 7.2 Integration Tests
- Complete onboarding flow with personalization
- API route authentication and data handling
- Chat context injection functionality
- Dashboard goals management

#### 7.3 Mobile Testing
- Responsive design across devices
- Touch interaction testing
- Performance testing on mobile networks

#### 7.4 Database Testing
- Migration script testing
- RLS policy verification
- Data integrity constraints
- Performance with large datasets

---

## 🛡️ Security Considerations

### Data Protection
- All personalization data protected by RLS policies
- User can only access/modify their own data
- Proper input validation and sanitization
- Secure API routes with JWT authentication

### Context Injection Security
- Validate personalization data before injection
- Prevent prompt injection attacks
- Limit context length to prevent abuse
- Log context usage for monitoring

---

## 📱 Mobile-First Design Principles

### UI/UX Guidelines
- Touch-first interactions (minimum 44px touch targets)
- Readable typography on small screens
- Consistent with existing mobile patterns
- Progressive enhancement for larger screens

### Performance
- Lazy load components where possible
- Optimize bundle size for mobile networks
- Efficient data fetching and caching
- Smooth animations and transitions

---

## 🔧 Technical Implementation Details

### File Structure
```
frontend-app/
├── components/onboarding/
│   ├── PersonalizationStep.tsx (NEW)
│   ├── OnboardingFlow.tsx (MODIFIED)
│   └── WelcomePage.tsx (MODIFIED)
├── components/dashboard/
│   └── GoalsSection.tsx (NEW)
├── lib/types/
│   └── personalization.ts (NEW)
├── utils/services/
│   └── personalization-service.ts (NEW)
└── app/api/personalization/
    ├── route.ts (NEW)
    └── goals/route.ts (NEW)
```

### State Management
- Use React state for form management
- Persist data to Supabase on step completion
- Handle loading and error states gracefully
- Optimistic updates where appropriate

### Error Handling
- Graceful degradation if personalization data unavailable
- Retry mechanisms for failed API calls
- User-friendly error messages
- Fallback to default behavior

---

## 🚀 Deployment Strategy

### Phase 1: Database & Types (Low Risk)
1. Deploy database schema changes
2. Deploy type definitions
3. Test with existing functionality

### Phase 2: Backend API (Medium Risk) 
1. Deploy personalization API routes
2. Test authentication and data handling
3. Verify RLS policies

### Phase 3: Frontend Components (Medium Risk)
1. Deploy personalization step (behind feature flag if needed)
2. Test onboarding flow end-to-end
3. Monitor for any issues

### Phase 4: Chat Integration (Higher Risk)
1. Deploy context injection functionality
2. Test AI agent responses thoroughly
3. Monitor performance impact

### Phase 5: Dashboard Features (Low Risk)
1. Deploy goals management features
2. Test user experience
3. Gather user feedback

---

## 📊 Success Metrics

### User Experience
- Onboarding completion rate
- Time to complete personalization step
- User satisfaction with personalized responses
- Mobile vs desktop completion rates

### Technical Performance  
- API response times
- Chat message processing time
- Mobile performance metrics
- Error rates and recovery

### Business Impact
- User engagement with personalized content
- Investment goal setting and tracking
- AI agent interaction quality
- User retention improvements

---

## 🐛 Risk Mitigation

### Potential Issues & Solutions

**1. Onboarding Flow Disruption**
- Risk: Breaking existing onboarding for current users
- Mitigation: Comprehensive testing, gradual rollout, rollback plan

**2. Chat Performance Impact**
- Risk: Context injection slowing down AI responses
- Mitigation: Optimize context size, caching, performance monitoring

**3. Mobile Experience Issues**
- Risk: Poor mobile UX affecting completion rates
- Mitigation: Mobile-first design, extensive device testing

**4. Data Migration Problems**
- Risk: Issues with existing user data
- Mitigation: Careful migration scripts, backup plans, staged rollout

**5. Security Vulnerabilities**
- Risk: Exposed personalization data or prompt injection
- Mitigation: Proper RLS, input validation, security testing

---

## 📅 Timeline Estimate

### Week 1: Foundation (Database & Types)
- Create database schema
- Implement TypeScript types
- Set up basic API routes
- Basic unit tests

### Week 2: Core Components
- Build PersonalizationStep component
- Update OnboardingFlow 
- Implement form validation
- Mobile responsive design

### Week 3: Integration & Context
- Chat context injection
- Dashboard goals section
- API integration
- Integration tests

### Week 4: Testing & Polish
- Comprehensive testing
- Mobile optimization
- Performance tuning
- Documentation

### Week 5: Deployment & Monitoring
- Staged deployment
- Performance monitoring
- Bug fixes
- User feedback collection

---

## ✅ Implementation Checklist

### Database & Types ✓
- [ ] Create user_personalization table with RLS
- [ ] Implement PersonalizationData TypeScript types
- [ ] Create database indexes for performance
- [ ] Write migration scripts for existing users

### Onboarding Flow Updates
- [ ] Add personalization step to OnboardingFlow
- [ ] Create PersonalizationStep component
- [ ] Update WelcomePage with new messaging
- [ ] Implement form validation and error handling
- [ ] Mobile responsive design

### AI Context Integration
- [ ] Create PersonalizationService
- [ ] Implement context template system
- [ ] Update chat message construction
- [ ] Test AI agent response quality

### Dashboard Features
- [ ] Create GoalsSection component
- [ ] Implement goals editing functionality
- [ ] Add API routes for goals management
- [ ] Integrate with existing dashboard layout

### Mobile Optimization
- [ ] Test on various mobile devices
- [ ] Optimize touch interactions
- [ ] Ensure responsive design
- [ ] Performance testing on mobile networks

### Testing Suite
- [ ] Unit tests for all new components
- [ ] Integration tests for onboarding flow
- [ ] API route testing
- [ ] Mobile testing across devices
- [ ] Performance and security testing

### Security & Performance
- [ ] Implement proper authentication
- [ ] Validate all user inputs
- [ ] Optimize database queries
- [ ] Monitor AI context performance
- [ ] Set up error tracking and logging

---

This implementation plan provides a comprehensive roadmap for adding personalized onboarding to Clera while maintaining production-grade quality and avoiding disruption to existing functionality. The plan emphasizes mobile-first design, security, and thorough testing throughout the implementation process.
