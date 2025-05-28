# Clera Proactive Assistance Design Document

## Executive Summary
This document outlines the design and implementation strategy for making Clera feel more present and helpful throughout the application. The goal is to transform Clera from a passive chat interface into an active financial advisor who proactively offers assistance when users might be confused or could benefit from guidance.

## Current State Analysis

### Application Structure
- **Main Pages**: Dashboard, Portfolio, Invest, News, Chat
- **Key Components**: Risk/Diversification scores, Portfolio analytics, News summaries, Investment ideas
- **Current Chat**: Side chat available on most pages, plus dedicated chat page
- **Suggested Questions**: Only visible in empty chat state (6 default questions)

### User Pain Points (Beta Feedback)
1. Users don't know how capable Clera is
2. Users don't know what questions to ask
3. Clera feels passive - users must actively seek help
4. No guidance when viewing complex financial data

## Design Philosophy

### Core Principles
1. **Johnny Ive Approach**: Intuitive, elegant, minimal friction
2. **Contextual Intelligence**: Clera appears when she can add value
3. **Mobile-First**: Must work seamlessly on all devices
4. **Non-Intrusive**: Helpful but never annoying
5. **Educational**: Guide users to understand Clera's capabilities

### Personality & Voice
- **Proactive but polite**: "I can help explain this" not "You need help"
- **Confident but humble**: "Let me break this down for you"
- **Contextual**: Suggestions are specific to what user is viewing

## Proposed Solution: "Clera Assist" System

### 1. Smart Card Highlighting System

#### Visual Design
- **Clera Glow**: Subtle blue glow around highlighted card (matches logo)
- **Assist Button**: Small, elegant button with Clera's icon
- **Tooltip Preview**: Brief explanation of what Clera can help with

#### Behavior
- **Desktop**: Card glows on hover, assist button appears
- **Mobile**: Card has persistent subtle indicator, tap reveals assist button
- **Active Card**: The topmost visible card gets highlighted by default

#### Implementation Strategy
```typescript
interface CleraAssistProps {
  content: string;          // What user is looking at
  context: string;          // Page context
  difficulty: "basic" | "intermediate" | "advanced";
  prompt: string;           // Pre-written prompt for Clera
  triggerText: string;      // Button text
  description: string;      // Tooltip description
}
```

### 2. Context-Aware Assistance

#### Dashboard Page
- **Account Info Card**: "Ask Clera about your account setup"
- **Bank Connections**: "Let Clera explain funding options"
- **Transfers**: "Ask Clera about transfer timelines"

#### Portfolio Page  
- **Risk/Diversification Scores**: "Have Clera explain what these scores mean"
- **Asset Allocation**: "Ask Clera about your investment mix"
- **Holdings Table**: "Let Clera analyze your positions"
- **What-If Calculator**: "Ask Clera about investment scenarios"

#### News Page
- **Portfolio Summary**: "Ask Clera to explain this in simple terms"
- **Trending News**: "Have Clera explain how this affects you"
- **Watchlist Categories**: "Ask Clera which categories are best for you"

#### Invest Page
- **Stock Picks**: "Ask Clera why we recommend these stocks"
- **Investment Ideas**: "Let Clera explain these strategies"
- **Search Results**: "Ask Clera to analyze this stock for you"

### 3. Progressive Disclosure System

#### Tier 1: Gentle Nudges
- Subtle visual indicators (small Clera icon)
- Minimal text: "Ask Clera"
- Appears after 3-5 seconds of viewing

#### Tier 2: Helpful Suggestions  
- More visible assist buttons
- Specific text: "Ask Clera to explain your risk score"
- Appears when hovering/tapping complex elements

#### Tier 3: Proactive Recommendations
- Contextual popups for first-time viewers
- "New to portfolio analysis? Let Clera guide you"
- Only shown once per user per feature

### 4. Smart Prompt System

#### Pre-Written Prompts
Each assist button generates a contextual prompt:

**Risk Score Example**:
```
"I'm looking at my risk score of 7.2/10 on my portfolio page. Can you explain what this means, how it's calculated, and what I should do about it? Here's my current portfolio: [context data]"
```

**News Summary Example**:
```
"I'm reading this portfolio news summary: '[summary text]'. Can you break this down for me in simple terms and explain how it specifically affects my investments?"
```

#### Dynamic Context Injection
- Current portfolio holdings
- User's financial goals (if available)
- Recent account activity
- Page-specific data

### 5. Multi-Device Interaction Patterns

#### Desktop (Hover-Based)
1. User hovers over card → Gentle glow appears
2. Clera assist button fades in smoothly  
3. Hover over button → Tooltip shows what Clera will explain
4. Click → Side chat opens with pre-written prompt sent

#### Mobile (Tap-Based)
1. Cards have subtle indicator (small Clera icon in corner)
2. Tap card → Expand to show assist option
3. Tap "Ask Clera" → Chat modal opens with prompt
4. Alternative: Long press for immediate Clera assistance

#### Tablet (Hybrid)
- Supports both interaction patterns
- Adapts based on touch vs cursor input

## Technical Implementation

### 1. Core Component: `CleraAssist`

```typescript
interface CleraAssistConfig {
  trigger: 'hover' | 'tap' | 'auto';
  placement: 'corner' | 'overlay' | 'inline';
  priority: 'low' | 'medium' | 'high';
  showCondition?: () => boolean;
}

const CleraAssist: React.FC<CleraAssistProps & CleraAssistConfig> = ({
  content, context, prompt, triggerText, description,
  trigger, placement, priority, showCondition
}) => {
  // Component implementation
};
```

### 2. Higher-Order Component: `withCleraAssist`

```typescript
const withCleraAssist = <P extends object>(
  Component: React.ComponentType<P>,
  assistConfig: CleraAssistProps & CleraAssistConfig
) => {
  return (props: P) => (
    <CleraAssist {...assistConfig}>
      <Component {...props} />
    </CleraAssist>
  );
};
```

### 3. Integration Points

#### Existing Cards
- Wrap existing card components with `withCleraAssist`
- Minimal changes to current codebase
- Maintain all existing functionality

#### Chat Integration
- Extend existing side chat functionality
- Add prompt injection system
- Preserve chat history and sessions

### 4. State Management

#### Context Providers
```typescript
interface CleraAssistContext {
  isEnabled: boolean;
  userPreferences: UserPreferences;
  currentPage: string;
  chatState: ChatState;
  openChatWithPrompt: (prompt: string) => void;
}
```

#### User Preferences
- Remember dismissed suggestions
- Learning from user interactions
- Customizable assistance level

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create base `CleraAssist` component
- [ ] Implement hover/tap interaction patterns
- [ ] Add blue glow animation system
- [ ] Test on dashboard page cards

### Phase 2: Core Features (Week 2)  
- [ ] Implement prompt injection system
- [ ] Add contextual prompt generation
- [ ] Create mobile interaction patterns
- [ ] Integrate with existing chat system

### Phase 3: Page Integration (Week 3)
- [ ] Add assistance to Portfolio page components
- [ ] Implement News page assistance
- [ ] Add Invest page guidance
- [ ] Create dashboard assistance

### Phase 4: Polish & Intelligence (Week 4)
- [ ] Add smart card highlighting
- [ ] Implement progressive disclosure
- [ ] User preference system
- [ ] Analytics and optimization

## Specific Implementation Examples

### Portfolio Risk Score Card

```typescript
// Before: Just the risk score component
<RiskDiversificationScores 
  accountId={accountId}
  initialData={analytics}
/>

// After: With Clera assistance
<CleraAssist
  content="Risk and diversification scores"
  context="portfolio_analytics"
  prompt={`I'm looking at my portfolio analytics with a risk score of ${riskScore}/10 and diversification score of ${divScore}/10. Can you explain what these scores mean, whether they're good for my situation, and what I can do to improve them?`}
  triggerText="Ask Clera to explain these scores"
  description="Get a simple explanation of your risk and diversification metrics"
  trigger="hover"
  placement="corner"
  priority="high"
>
  <RiskDiversificationScores 
    accountId={accountId}
    initialData={analytics}
  />
</CleraAssist>
```

### News Summary Card

```typescript
<CleraAssist
  content="Portfolio news summary"
  context="news_summary"
  prompt={`I'm reading this portfolio news summary: "${summaryText}". Can you break this down in simple terms and explain specifically how this news affects my investments?`}
  triggerText="Ask Clera to simplify this"
  description="Get a plain-English explanation of how this news affects you"
  trigger="auto"
  placement="inline"
  priority="medium"
  showCondition={() => summaryText.length > 200} // Only for complex summaries
>
  <NewsSummaryCard summary={summaryText} />
</CleraAssist>
```

## Design Specifications

### Visual Elements

#### Clera Glow
```css
.clera-glow {
  position: relative;
  transition: all 0.3s ease;
}

.clera-glow:hover::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(45deg, #007AFF, #5AC8FA);
  border-radius: inherit;
  z-index: -1;
  opacity: 0.6;
  filter: blur(4px);
}
```

#### Assist Button
```css
.clera-assist-button {
  background: linear-gradient(135deg, #007AFF, #5AC8FA);
  border: none;
  border-radius: 20px;
  padding: 8px 16px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
}

.clera-assist-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.4);
}
```

### Animation Timings
- **Glow appearance**: 300ms ease-out
- **Button fade-in**: 200ms ease-in
- **Tooltip appearance**: 150ms ease-out
- **Chat opening**: 400ms ease-in-out

## Success Metrics

### User Engagement
- Increase in chat interactions by 300%
- Higher retention on complex pages (Portfolio, News)
- Reduced time to first meaningful chat interaction

### Learning Indicators
- Users asking more sophisticated questions
- Decreased repeat basic questions
- Increased feature adoption (portfolio analysis, etc.)

### Satisfaction Metrics
- Beta user feedback improvement
- Reduced confusion indicators
- Higher self-reported confidence with financial data

## Future Enhancements

### Smart Timing
- Machine learning to predict when users need help
- Contextual triggers based on user behavior
- Adaptive assistance based on user expertise level

### Personalization
- Learning user preferences and expertise
- Customized assistance suggestions
- Progressive complexity based on user growth

### Advanced Features
- Voice activation: "Hey Clera, explain this"
- Gesture-based assistance on mobile
- Integration with user's financial goals and timeline

## Conclusion

This Clera Assist system transforms the user experience from passive to actively guided, making Clera's capabilities discoverable and accessible exactly when users need them. The design balances helpfulness with elegance, ensuring users feel supported without being overwhelmed.

The phased implementation allows for iterative testing and refinement, while the technical architecture ensures the system can evolve with user needs and feedback.
