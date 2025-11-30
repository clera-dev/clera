# Project Proposal for CS 175

**Project Title:** Memory-Augmented Reinforcement Learning for Clera's Multi-Agent Investment Advisor

**Team Members:** Cristian F. Mendoza (17906479, cfmendo1@uci.edu), Delphine Tai-Beauchamp, Agaton Pourshahidi

## 1. Project Summary
This project implements reinforcement learning through LangMem, enabling Clera (our multi-agent investment advisor) to learn from past interactions like human wealth managers. The system stores successful conversation patterns, user preferences, and investment outcomes, using user feedback (+1 thumbs up, -1 thumbs down) as reward signals. Through experience replay and behavioral cloning, agents retrieve and adapt from similar past successes. Evaluation will measure memory accumulation, recommendation accuracy improvements, and user satisfaction across 500+ interactions.

## 2. Problem Definition
Clera uses a multi-agent architecture (financial analyst, portfolio manager, trade executor) to provide investment advice but operates statelessly—forgetting past conversations, user preferences, and successful patterns. This prevents learning from mistakes or adapting to individual users like human wealth managers do.

**Inputs:** User queries; real-time market data; portfolio information; explicit feedback (thumbs up/down); implicit feedback (conversation patterns). **Outputs:** Personalized recommendations that improve over time; portfolio analysis informed by past outcomes; market insights referencing successful analyses. **Prior Work:** RLHF requires expensive model retraining; RAG lacks structured learning. LangMem provides lightweight RL through memory-based experience replay and reward-weighted retrieval, enabling learning without model fine-tuning.

## 3. Proposed Technical Approach
We implement RL through LangMem's memory system: (1) **Semantic Memory** stores user preferences and successful strategies ("NVDA recommendations during rallies yield +15%"), (2) **Episodic Memory** captures successful conversation trajectories for behavioral cloning, (3) **Procedural Memory** optimizes prompts based on accumulated rewards.

**RL Framework:** State = conversation context + memories + market conditions; Action = agent recommendations; Reward = +1/-1 (immediate feedback) + portfolio performance vs S&P 500 (delayed); Policy = prompts + retrieved successful patterns; Learning = reward-weighted memory retrieval.

**Pipeline:** Query processing searches memory for context → Response integrates real-time data with learned patterns → Feedback collection stores interaction with reward score → Memory update weights successful patterns highly → Background process tracks 30-day portfolio performance. **Technical Components:** LangMem integration (~100 lines), PostgreSQL memory store with vector embeddings, feedback API (~100 lines), reward tracker (~150 lines), evaluation dashboard (~100 lines). Achievable in 1-2 weeks using existing infrastructure (LangGraph, PostgreSQL).

## 4. Data Sets
**Training Data:** 500+ conversation logs (queries, responses, feedback) stored in PostgreSQL with LangMem integration. **Synthetic Bootstrap:** 100 hand-crafted examples covering stock analysis, portfolio questions, trade requests to initialize memory. **Market Data:** Financial Modeling Prep API (~5000 tickers), SnapTrade API (user portfolios), web search (news). **Evaluation Set:** 100 interactions (20% weekly) held out to ensure pattern learning vs memorization. No external datasets needed—learning happens through organic usage.

## 5. Experiments and Evaluation
**Metrics:** (1) Memory accumulation over time (exponential growth stabilizing ~200 interactions), (2) Recommendation accuracy via 30-day portfolio performance vs S&P 500 (target: +5-10% alpha improvement baseline→learned), (3) User satisfaction thumbs-up rate (baseline 65%→target 80%+), (4) Memory retrieval relevance (target >80%). **Setup:** Week 1 baseline (no memory), Weeks 2-6 learning period, Weeks 7-8 evaluation. **Statistical Testing:** Paired t-test for satisfaction, bootstrap confidence intervals, A/B test (50 queries baseline vs memory-augmented).

## 6. Software
**Language:** Python 3.12. **Public Software:** LangMem (core RL), LangChain/LangGraph, PostgreSQL, OpenAI/Anthropic APIs, Financial Modeling Prep API, SnapTrade API, NumPy/Pandas, Matplotlib/Plotly, pytest. **Code We Write:** (1) LangMem integration (`memory_tools.py`, 150 lines), (2) Feedback API (`feedback_routes.py`, 100 lines), (3) Reward tracker (`reward_tracker.py`, 150 lines), (4) Memory-augmented agents (modify `graph.py`, 80 lines), (5) Evaluation scripts (150 lines), (6) Synthetic data generator (100 lines), (7) Visualization dashboard (120 lines). **Total:** ~850 lines across 3 people. Code committed to existing Clera repository under `backend/clera_agents/reinforcement_learning/`.

## 7. Individual Student Responsibilities
**Cristian Mendoza:** Integrate LangMem tools into agents, implement feedback API, create memory-augmented prompts, build synthetic data generator. **Delphine Tai-Beauchamp:** Develop reward tracker (immediate + delayed), configure memory store with PostgreSQL/embeddings, create memory consolidation, integrate portfolio performance measurement. **Agaton Pourshahidi:** Design A/B tests, create visualization dashboard, conduct statistical analysis, generate learning curves, write final report and presentation.

