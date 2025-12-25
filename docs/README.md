# Clera Documentation

Welcome to the Clera documentation. This directory contains comprehensive documentation for the Clera AI-powered investment platform.

## 📁 Directory Structure

### 🤖 **AI & Agents** (`/ai-agents/`)
- **Agent System Prompts** - Core agent architecture and prompting strategies
- **Chat Integration** - Real-time chat system documentation
- **LLM Scratchpad** - Development notes and experiments
- **Voice AI** - Voice interaction capabilities

### 🏗️ **Architecture** (`/architecture/`)
- **Backend Notes** - Backend system architecture and implementation
- **Frontend Notes** - Frontend architecture and component structure
- **Codebase Catchup** - Quick reference for codebase understanding
- **Development Guidelines** - Best practices and coding standards

### 💰 **Investment & Trading** (`/investment/`)
- **Investment Research** - AI-powered investment recommendation system
- **Portfolio Management** - Portfolio analysis and real-time tracking
- **Trade Execution** - Order execution and trading workflows
- **Account Onboarding** - User account setup and verification

### 📊 **Data & APIs** (`/data-apis/`)
- **Alpaca Integration** - Trading platform integration
- **Supabase Notes** - Database and backend services
- **Market Data** - Real-time market data handling


### ⚙️ **Operations** (`/operations/`)
- **Email Configuration** - Email service setup and templates
- **Portfolio Realtime Setup** - Real-time data infrastructure
- **LangSmith Fetch Guide** - Debugging agent workflows with LangSmith traces
- **Troubleshooting** - Common issues and solutions

### 🔧 **External Integrations** (`/integrations/`)
- **LangGraph** - Workflow orchestration framework
- **Alpaca** - Trading platform documentation

## 🚀 Quick Start for Agents/LLMs

### For Investment Queries:
1. Check `/investment/investment-research.md` for recommendation system
2. Review `/investment/portfolio-management.md` for portfolio analysis
3. See `/data-apis/alpaca-integration.md` for trading capabilities

### For User Assistance:
1. Start with `/ai-agents/agent-system-prompts.md` for core architecture
2. Review `/ui-ux/clera-assist-strategy.md` for assistance framework
3. Check `/ai-agents/chat-integration.md` for real-time interactions

### For Technical Implementation:
1. Begin with `/architecture/backend-notes.md` and `/architecture/frontend-notes.md`
2. Review `/architecture/dev-guidelines.md` for best practices
3. Check `/operations/` for deployment and configuration

### For Debugging Agent Workflows:
1. Use `/operations/langsmith-fetch-guide.md` to fetch and analyze traces
2. Run `./backend/scripts/fetch_langsmith_traces.sh traces 10` for quick debugging
3. Review trace JSON files for agent behavior and tool usage

## 📝 Documentation Standards

- **File Naming**: Use kebab-case (e.g., `investment-research.md`)
- **Headers**: Use clear, descriptive titles with proper hierarchy
- **Cross-references**: Link to related documents when relevant
- **Code Examples**: Include practical code snippets and configurations
- **Status Indicators**: Mark documents as `[DRAFT]`, `[STABLE]`, or `[DEPRECATED]`

## 🔄 Maintenance

- Update this README when adding new documentation
- Review and clean up outdated files quarterly
- Ensure all links remain functional
- Keep agent/LLM context files up to date

---

*Last updated: [Current Date]*
*For questions about documentation organization, refer to the development guidelines.*
