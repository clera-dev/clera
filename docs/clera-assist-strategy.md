# Clera Assist Implementation Strategy

## Overview
Implement consistent Clera assistance across all major UI components using a tiered approach that matches the sophistication of each component with appropriate levels of help.

## Tier Classifications

### **Tier 1: Deep Analysis Components** 
*Complex data requiring sophisticated interpretation*
- Portfolio Analytics (Risk/Diversification scores)
- Asset Allocation charts
- Portfolio News Summary
- Performance charts
- Holdings analysis

**Clera's Role:** Advanced financial analysis, interpretation, actionable insights

### **Tier 2: Educational Components**
*Moderate complexity requiring context and learning*
- Investment Growth Projections
- News sections (trending, watchlist)
- Individual holding cards
- Transaction history
- Account summary

**Clera's Role:** Educational guidance, market context, next-step suggestions

### **Tier 3: Basic Guidance Components**
*Simple components that benefit from general guidance*
- Add Funds button areas
- Empty states
- Loading states
- Navigation elements
- Settings areas

**Clera's Role:** General investment guidance, feature explanation, getting started help

## Implementation Approach

### **Portfolio Page**
- ✅ Risk/Diversification (Tier 1) - IMPLEMENTED
- ✅ Asset Allocation (Tier 1) - IMPLEMENTED  
- 🔄 Portfolio Summary Card (Tier 2)
- 🔄 Investment Growth Calculator (Tier 2)
- 🔄 Holdings Table (Tier 2)
- 🔄 Transactions Table (Tier 2)

### **News Page**
- ✅ Portfolio News Summary (Tier 1) - IMPLEMENTED
- 🔄 Trending News (Tier 2)
- 🔄 Watchlist Categories (Tier 3)

### **Invest Page**
- 🔄 Stock Search (Tier 2)
- 🔄 Stock Details (Tier 1)
- 🔄 Buy/Sell Forms (Tier 2)
- 🔄 Market Hours Info (Tier 3)

### **Chat Page**
- 🔄 Suggested Questions (Tier 3)
- 🔄 Empty Chat State (Tier 3)

## Prompt Templates by Tier

### **Tier 1 Prompts**
Focus on sophisticated analysis and interpretation:
```
"I'm looking at [specific data] showing [current state]. Can you analyze what this means for my investment strategy and suggest specific actions I should consider?"
```

### **Tier 2 Prompts**  
Focus on education and context:
```
"I'm viewing [component/data]. Can you explain what this means and help me understand how it fits into my overall investment approach?"
```

### **Tier 3 Prompts**
Focus on guidance and getting started:
```
"I'm in the [section] area. Can you explain how to use this feature and what I should know as a young investor?"
```

## Disabled States
All components respect trade history:
- **Before First Trade:** Disabled assistance (no portfolio to analyze)
- **After First Trade:** Full assistance enabled
- **Error States:** Helpful fallback prompts for troubleshooting

## Visual Consistency
- Consistent blue glow effect (`clera-glow`)
- Uniform button styling (`clera-assist-button`) 
- Predictable positioning (header area when possible)
- Mobile-optimized interactions

## User Experience Goals
1. **Predictability:** Users learn to expect assistance everywhere
2. **Relevance:** Each prompt matches the sophistication of the component
3. **Progression:** Guide users from simple to complex concepts
4. **Consistency:** Same interaction patterns across all components 