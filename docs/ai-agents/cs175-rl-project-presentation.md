# CS 175 Project Presentation: Memory-Augmented RL for Clera

**Duration:** 2-3 minutes | **Slides:** 7

---

## SLIDE 1: Title Slide

### ON SCREEN:
```
Memory-Augmented Reinforcement Learning 
for Clera's Multi-Agent Investment Advisor

Cristian Mendoza, Delphine Tai-Beauchamp, Agaton Pourshahidi
CS 175 - Reinforcement Learning
```

### SCRIPT:
"Hi everyone! Today we're presenting our final project on applying reinforcement learning to Clera, a multi-agent AI investment advisor we've been building. We're implementing memory-based RL to help our agents learn from past interactions, just like human wealth managers do."

**[5 seconds]**

---

## SLIDE 2: The Problem

### ON SCREEN:
```
THE PROBLEM
❌ Current AI advisors forget everything
❌ Can't learn from mistakes  
❌ No personalization over time

Human wealth managers:
✓ Remember past conversations
✓ Learn from what works
✓ Adapt to each client
```

### SCRIPT:
"Here's the problem: most AI financial advisors, including our current version of Clera, operate completely statelessly. Every conversation starts from scratch. If a user corrects the AI or gives feedback, it's forgotten by the next session. Human wealth managers don't work this way—they remember your preferences, learn from successful recommendations, and improve over time. That's what we're solving."

**[30 seconds]**

---

## SLIDE 3: Our Solution - RL with LangMem

### ON SCREEN:
```
SOLUTION: Memory-Based Reinforcement Learning

LangMem Framework
├─ Semantic Memory: User preferences & successful patterns
├─ Episodic Memory: Past successful conversations  
└─ Procedural Memory: Optimized decision-making prompts

User Feedback = Reward Signal
👍 +1  |  👎 -1  |  30-day portfolio performance
```

### SCRIPT:
"Our solution uses LangMem, a memory framework for AI agents, to implement reinforcement learning. We have three memory types: semantic memory stores facts like user preferences and successful strategies—for example, 'tech stock recommendations during rallies yield 15% better returns.' Episodic memory captures entire successful conversations for behavioral cloning. And procedural memory optimizes our agent prompts based on accumulated feedback. The key insight is that user thumbs up and thumbs down become our reward signals, and portfolio performance over 30 days provides delayed rewards."

**[45 seconds]**

---

## SLIDE 4: How It Works - The RL Loop

### ON SCREEN:
```
THE REINFORCEMENT LEARNING LOOP

1. STATE: User query + retrieved memories + market data
2. ACTION: Agent generates recommendation
3. REWARD: Thumbs up/down (immediate)
           Portfolio performance (delayed)
4. LEARNING: Store experience weighted by reward
5. IMPROVE: Retrieve similar successful patterns for future queries

Experience Replay → Behavioral Cloning → Better Recommendations
```

### SCRIPT:
"Here's how the RL loop works: The state includes the user's query, relevant memories we retrieve, and current market conditions. Our agents take actions by generating investment recommendations. We collect rewards through explicit user feedback—thumbs up or down—and delayed rewards by measuring portfolio performance versus the S&P 500 after 30 days. The system learns by storing successful interactions with high importance weights and failed approaches with negative weights. Then for future similar queries, we retrieve those successful patterns and mimic them—that's behavioral cloning from experience replay, a core RL technique."

**[50 seconds]**

---

## SLIDE 5: Implementation Details

### ON SCREEN:
```
IMPLEMENTATION (1-2 Weeks)

Technical Stack:
• LangMem + LangGraph (already integrated)
• PostgreSQL with vector embeddings (existing)
• ~850 lines of new code split across team

Data:
• 500+ real user conversations
• 100 synthetic bootstrap examples
• Market data APIs (Financial Modeling Prep, SnapTrade)

We're leveraging existing infrastructure!
```

### SCRIPT:
"Implementation is realistic for our timeline because we're building on existing infrastructure. Clera already uses LangGraph for multi-agent orchestration and PostgreSQL for persistence—we even explored LangMem before but didn't integrate it. We'll write about 850 lines of code split across the three of us. For data, we'll collect 500+ real conversations with user feedback, plus we're creating 100 synthetic examples to bootstrap the memory before we have real data. The key here is we're not building everything from scratch—we're adding RL capabilities to a working system."

**[35 seconds]**

---

## SLIDE 6: Expected Results & Evaluation

### ON SCREEN:
```
EVALUATION METRICS

📊 Memory Growth: Track accumulation over time
📈 Recommendation Accuracy: Portfolio performance 
   Baseline (Week 1-2) → Learned (Week 6-8)
   Target: +5-10% alpha improvement
   
😊 User Satisfaction: Thumbs-up rate
   Baseline: 65% → Target: 80%+
   
🎯 Memory Relevance: >80% retrieval accuracy

A/B Testing: Baseline Clera vs Memory-Augmented Clera
```

### SCRIPT:
"For evaluation, we're measuring four key metrics. First, memory accumulation—we expect exponential growth early that stabilizes around 200 interactions. Second, recommendation accuracy by comparing 30-day portfolio performance in early weeks versus later weeks—we're targeting 5 to 10 percent alpha improvement over baseline. Third, user satisfaction through thumbs-up rates, going from 65% baseline to 80%+. And fourth, memory retrieval relevance—making sure the memories we pull are actually useful. We'll run A/B tests with 50 identical queries through both the baseline system and memory-augmented system, and use paired t-tests for statistical significance."

**[45 seconds]**

---

## SLIDE 7: Why This Matters

### ON SCREEN:
```
IMPACT

For CS 175:
✓ Real-world RL application
✓ Experience replay + behavioral cloning
✓ Immediate & delayed rewards
✓ Measurable learning over time

For Clera Users:
✓ Personalized advice that improves with each interaction
✓ AI that learns from mistakes
✓ Wealth management that remembers you

This is RL applied to modern LLM agent systems.
```

### SCRIPT:
"So why does this matter? From an academic perspective, we're applying real RL principles—experience replay, behavioral cloning, reward-based learning—to a modern LLM agent system. This is how RL works in practice with large language models: memory-based learning instead of expensive model retraining. And from a product perspective, we're building something users actually want: an AI financial advisor that remembers them, learns from their feedback, and improves over time. It's reinforcement learning meets real-world AI agents. Happy to take questions!"

**[35 seconds]**

---

## SLIDE 8: Thank You / Questions

### ON SCREEN:
```
Thank You!

Questions?

Cristian Mendoza, Delphine Tai-Beauchamp, Agaton Pourshahidi
cfmendo1@uci.edu
```

### SCRIPT:
"Thank you! We're happy to answer any questions."

**[5 seconds + Q&A]**

---

## PRESENTATION TIPS:

### Before You Start:
- **Practice the transitions** between slides—they should feel natural
- **Time yourself**: Aim for 2:30-3:00 total
- **Have one person present** or split smoothly (e.g., Cristian: Slides 1-4, Delphine: Slide 5, Agaton: Slides 6-7)

### During Presentation:
- **Slide 2 (Problem)**: This is your hook—make it relatable
- **Slide 3-4 (Solution/How)**: This is where you sell the RL connection—emphasize "experience replay," "behavioral cloning," "reward signals"
- **Slide 5 (Implementation)**: Show it's realistic and achievable
- **Slide 6 (Results)**: Show you've thought through evaluation rigorously
- **Slide 7 (Impact)**: End strong—connect back to RL principles

### If Asked About RL Connection:
"We're using memory-based RL—storing experiences weighted by rewards, then retrieving and mimicking successful past behaviors. This is experience replay combined with behavioral cloning, which are established RL techniques. Instead of updating neural network weights, we're updating a memory store, but the learning principle is the same: optimize policy based on reward feedback."

### If Asked About Timeline:
"We already have the infrastructure—LangGraph, PostgreSQL, even explored LangMem before. We're adding RL on top of existing functionality. The 850 lines across three people is about 280 lines each, which is very doable in 1-2 weeks."

---

## TOTAL TIME BREAKDOWN:
- Slide 1: 5s
- Slide 2: 30s  
- Slide 3: 45s
- Slide 4: 50s
- Slide 5: 35s
- Slide 6: 45s
- Slide 7: 35s
- Slide 8: 5s

**Total: ~3:30 minutes** (leaves 1:30 for Q&A if needed)



