# Clera Frontend Documentation

## Overview

The Clera frontend is built using Next.js with TypeScript, following the App Router architecture. The application integrates with Supabase for authentication and database access, and uses TailwindCSS for styling. The frontend provides a user interface for Clera's financial AI platform, including authentication flows and protected routes.

## Directory Structure

```
frontend-app/
├── app/                   # Next.js App Router
│   ├── (auth-pages)/      # Authentication page routes (grouped)
│   ├── auth/              # Auth callback handling
│   │   ├── callback/      # OAuth and email verification callback
│   │   └── confirm/       # Email confirmation
│   ├── api/               # API routes
│   │   └── broker/        # Broker API integration
│   │       ├── create-account/ # Alpaca account creation endpoint
│   │       ├── connect-bank/ # Plaid bank connection endpoint
│   │       ├── connect-bank-manual/ # Manual bank connection endpoint
│   │       ├── bank-status/ # ACH relationship status check
│   │       └── transfer/ # ACH transfer initiation
│   ├── dashboard/         # Dashboard page showing account info and funding status
│   ├── notes/             # Notes feature
│   ├── protected/         # Protected routes (require authentication)
│   │   └── reset-password/ # Password reset functionality
│   ├── actions.ts         # Server actions for auth and onboarding
│   ├── globals.css        # Global CSS styles
│   ├── layout.tsx         # Root layout component
│   └── page.tsx           # Home page component
│
├── components/            # Reusable UI components
│   ├── ui/                # UI component library
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx       # Card component with header, content, and footer
│   │   ├── checkbox.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   └── tooltip.tsx    # Tooltip component for displaying additional information
│   ├── dashboard/         # Dashboard components
│   │   ├── AccountInfoCard.tsx    # Displays Alpaca account information
│   │   ├── BankConnectionButton.tsx # Button to initiate bank connection
│   │   ├── BankConnectionsCard.tsx # Shows connected bank accounts
│   │   ├── ManualBankEntry.tsx    # Entry point for manual bank connection
│   │   ├── ManualBankForm.tsx     # Form for manual bank account details
│   │   ├── TransferForm.tsx       # Form for entering transfer amount
│   │   └── TransfersCard.tsx      # Displays recent transfers
│   ├── onboarding/        # Onboarding components for brokerage account setup
│   │   ├── AgreementsStep.tsx        # Step for accepting user agreements
│   │   ├── ContactInfoStep.tsx       # Step for collecting contact information
│   │   ├── DisclosuresStep.tsx       # Step for user disclosures
│   │   ├── OnboardingFlow.tsx        # Main onboarding flow component
│   │   ├── OnboardingTypes.ts        # TypeScript interfaces for onboarding
│   │   ├── PersonalInfoStep.tsx      # Step for collecting personal information
│   │   ├── ProgressBar.tsx           # Progress bar for onboarding steps
│   │   ├── SubmissionSuccessStep.tsx # Success step after submission
│   │   └── WelcomePage.tsx           # Initial welcome screen
│   ├── typography/        # Typography components
│   ├── tutorial/          # Tutorial components
│   ├── deploy-button.tsx  # Vercel deployment button
│   ├── form-message.tsx   # Form feedback messages
│   ├── header-auth.tsx    # Authentication header
│   ├── hero.tsx           # Hero section component
│   ├── submit-button.tsx  # Form submission button
│   └── theme-switcher.tsx # Dark/light mode switcher
│
├── lib/                   # Library code
│   └── utils.ts           # Utility functions
│
├── utils/                 # Utility functions and services
│   ├── api/               # API utilities
│   │   ├── alpaca.ts      # Alpaca broker API integration
│   │   └── onboarding-client.ts # Client-side wrapper for onboarding server actions
│   ├── supabase/          # Supabase client utilities
│   │   ├── check-env-vars.ts  # Environment variables validation
│   │   ├── client.ts      # Browser client initialization
│   │   ├── middleware.ts  # Auth middleware
│   │   └── server.ts      # Server-side client
│   └── utils.ts           # General utilities
│
├── .env.local             # Environment variables
├── components.json        # Shadcn UI components config
├── middleware.ts          # Next.js middleware for auth
├── next.config.ts         # Next.js configuration
├── package.json           # Project dependencies
├── tailwind.config.ts     # TailwindCSS configuration
└── tsconfig.json          # TypeScript configuration
```

## Core Components

### Authentication System

The application uses Supabase for authentication with features including:

- User sign-up and sign-in
- Email verification
- Password reset functionality
- Protected routes that require authentication
- Server-side authentication using middleware

The authentication flow is implemented using Next.js server actions in `app/actions.ts`, which includes:

- `signUpAction`: Handles user registration
- `signInAction`: Handles user login
- `forgotPasswordAction`: Sends password reset emails
- `resetPasswordAction`: Updates user passwords
- `signOutAction`: Logs users out

### Supabase Integration

The application integrates with Supabase for authentication and database services using a client-server pattern:

- **Server-Side Operations**: 
  - `utils/supabase/server.ts`: Server-side Supabase client that uses `next/headers` 
  - `app/actions.ts`: Server actions for database operations (onboarding data, authentication)
  - Used in server components and server actions

- **Client-Side Operations**:
  - `utils/supabase/client.ts`: Browser-side Supabase client for non-sensitive operations
  - `utils/api/onboarding-client.ts`: Client-side wrapper for server actions
  - Used in client components marked with "use client"

This separation follows Next.js best practices by ensuring server-only code runs on the server and client-only code runs in the browser.

### Supabase Database Schema

The application uses the following tables in Supabase:

1. **user_onboarding**: Stores onboarding data and Alpaca account information
   ```sql
   CREATE TABLE public.user_onboarding (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     onboarding_data JSONB,
     status TEXT,
     alpaca_account_id TEXT,
     alpaca_account_number TEXT,
     alpaca_account_status TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

2. **user_bank_connections**: Stores bank connection information
   ```sql
   CREATE TABLE public.user_bank_connections (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     alpaca_account_id TEXT NOT NULL,
     relationship_id TEXT NOT NULL,
     bank_name TEXT NOT NULL,
     bank_account_type TEXT NOT NULL,
     last_4 TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ
   );
   ```

3. **user_transfers**: Stores ACH transfer information
   ```sql
   CREATE TABLE public.user_transfers (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     alpaca_account_id TEXT NOT NULL,
     relationship_id TEXT NOT NULL,
     transfer_id TEXT NOT NULL,
     amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
     status TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ
   );
   ```

All tables use Row-Level Security policies to ensure users can only access their own data.

### UI Components

The frontend uses a combination of custom components and a UI library (Shadcn UI based on the components.json file):

- Basic UI components in `components/ui/`
- Form components with validation
- Theme switching between light and dark modes
- Typography components for consistent text styling
- Layout components for page structure
- Card components for dashboard information display
- Tooltip components for explanatory information

### Broker Account Onboarding Flow

The application includes a multi-step onboarding flow for setting up a brokerage account through Alpaca:

1. **Onboarding Flow**: The main component that orchestrates the entire flow
   - Maintains state using React useState
   - Uses Next.js router for navigation
   - Stores progress using server actions
   - Submits form data to Alpaca API through backend

2. **Onboarding Steps**:
   - Welcome Page: Initial welcome screen
   - Contact Information: Collects user's contact details
   - Personal Information: Collects personal details needed for KYC
     - First name, last name, date of birth
     - Social Security Number (in XXX-XX-XXXX format)
     - Citizenship and tax residency information
     - Funding sources
   - Disclosures: Regulatory required disclosures
     - Control person status
     - Exchange/FINRA affiliation
     - Political exposure questions
   - Agreements: Legal agreements user must accept
     - Customer agreement (required)
     - Account agreement (required)
     - Margin agreement (optional)
   - Success: Confirmation after successful submission

3. **Alpaca Integration**:
   - Uses a utility (`utils/api/alpaca.ts`) to format data for Alpaca API
   - Makes requests through a Next.js API route (`/api/broker/create-account`)
   - Stores account information in Supabase after creation

### Bank Account Connection and Funding

The application provides two methods for connecting bank accounts for ACH funding:

1. **Plaid Integration**:
   - `BankConnectionButton` component for initiating Plaid connection
   - OAuth redirect flow for secure authentication
   - `/api/broker/connect-bank` API route for creating Plaid Link URLs
   - `/api/broker/bank-status` for checking ACH relationship status
   - Automatic polling for relationship status after connection
   - User is directed to transfer form after successful connection

2. **Manual Bank Account Entry**:
   - `ManualBankEntry` component as alternative to Plaid
   - `ManualBankForm` for collecting bank account details:
     - Account type (Checking or Savings)
     - Account number
     - Routing number (pre-filled with valid test number for sandbox)
   - `/api/broker/connect-bank-manual` API route for manual connection
   - Error handling for Alpaca's single ACH relationship constraint

3. **ACH Transfer Flow**:
   - `TransferForm` component for entering transfer amount
   - Validation for minimum transfer amount ($1.00)
   - `/api/broker/transfer` API route for initiating transfers
   - Multi-layered storage approach:
     - Primary storage in Supabase
     - Fallback storage in localStorage
     - Automatic syncing between both

### Dashboard Components

After account creation and funding, the user accesses a dashboard with:

1. **Account Information Card**:
   - Welcome message with the user's first name
   - Account number, status, and creation date
   - Current cash balance

2. **Bank Connections Card**:
   - Connected bank accounts with status
   - Connection date and bank account details
   - Option to connect additional bank accounts

3. **Transfers Card**:
   - Recent transfers with amount and status
   - Processing information with tooltips
   - Transfer history

4. **Data Persistence Strategy**:
   - Primary storage in Supabase database
   - Secondary storage in browser localStorage
   - Robust error handling and recovery mechanisms
   - Automatic backfilling of database from localStorage

### Styling

The application uses:

- TailwindCSS for utility-based styling
- CSS modules for component-specific styles
- A consistent theme defined in `tailwind.config.ts`
- Responsive design for different device sizes
- Tailwind merge and clsx for conditional class merging

### Third-Party Integrations

Based on the environment variables, the application integrates with:

- **Alpaca**: For brokerage account creation and management
- **Plaid**: For bank account connection and ACH funding
- **LiveKit**: For real-time communication features

The application requires the following environment variables in `.env.local`:

```
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Backend API Configuration
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000

# Plaid Configuration
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Key Features

1. **Authentication**: Complete auth flow with sign-up, sign-in, and password reset
2. **Protected Routes**: Secure areas that require authentication
3. **Theme Switching**: Support for light and dark mode
4. **Responsive Design**: Mobile and desktop friendly UI
5. **Brokerage Onboarding**: Multi-step flow for setting up Alpaca brokerage accounts
6. **Bank Connection**: Both Plaid integration and manual connection options
7. **ACH Funding**: Flow for transferring money from bank to Alpaca account
8. **Dashboard**: Comprehensive view of account, bank connections, and transfers
9. **Data Persistence**: Robust storage in Supabase with localStorage fallback

## Error Handling and Resilience

The application implements several strategies for robust error handling:

1. **Connection Error Handling**:
   - Displays appropriate error messages if bank connection fails
   - Gracefully handles OAuth redirect failures
   - Provides feedback for validation errors
   - Handles Alpaca's limitation of one active ACH relationship per account

2. **Data Persistence Resilience**:
   - Multi-layered storage with automatic recovery
   - Detailed logging for debugging
   - Graceful handling of database connection issues
   - Client-side fallbacks for server-side failures

3. **User Experience Improvements**:
   - Auto-detection of existing ACH relationships
   - Redirect to dashboard after successful connections
   - Information tooltips for transfer processing times
   - Prevention of duplicate transfers

## Development Environment

The application includes:

- TypeScript for type safety
- ESLint for code linting
- Prettier for code formatting
- Next.js development server with hot reloading
- Environment variable management for different configurations

## Getting Started

To run the application locally:

1. Install dependencies: `npm install`
2. Configure environment variables in `.env.local`
3. Start the development server: `npm run dev`
4. Access the application at `http://localhost:3000`

## Deployment

The frontend application is deployed through Vercel for production environments:

- The production build is automatically generated through Vercel's CI/CD pipeline
- Environment variables are configured in the Vercel project settings
- Custom domains and SSL certificates are managed through Vercel
- Automatic preview deployments are available for pull requests

The Vercel deployment provides:
- Global CDN distribution
- Edge caching for improved performance
- Automatic HTTPS with SSL certificates
- Continuous deployment from the GitHub repository

### Vercel Deployment Configuration

#### Project Configuration

The frontend is configured in Vercel with the following settings:

1. **Build Configuration**:
   - Framework Preset: `Next.js`
   - Build Command: `next build`
   - Output Directory: `.next`
   - Install Command: `npm install`
   - Node.js Version: 18.x

2. **Domain Configuration**:
   - Production Domain: `app.clera.ai`
   - Automatic SSL/TLS certificates
   - Custom DNS records for domain verification

3. **Environment Variables**:
   Vercel manages environment variables across different deployment environments:

   **Production Environment**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_BACKEND_API_URL=https://api.clera.ai
   PLAID_ENV=production
   NEXT_PUBLIC_BASE_URL=https://app.clera.ai
   ```

   **Preview Environments**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-staging-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-staging-anon-key
   NEXT_PUBLIC_BACKEND_API_URL=https://api-staging.clera.ai
   PLAID_ENV=sandbox
   NEXT_PUBLIC_BASE_URL=https://staging.clera.ai
   ```

4. **Git Integration**:
   - Connected to the GitHub repository
   - Auto-deployment on commits to the `main` branch
   - Preview deployments for pull requests
   - Protection rules for production deployment

5. **Performance Optimizations**:
   - Image Optimization API enabled
   - Automatic compression and minification
   - Edge caching with configurable TTL
   - Incremental Static Regeneration (ISR) for dynamic content

#### Deployment Process

1. **Automatic Deployments**:
   - Push to `main` branch triggers production build
   - Vercel runs build process:
     ```bash
     npm install
     next build
     ```
   - Production deployments automatically aliased to primary domain

2. **Preview Deployments**:
   - Pull requests generate unique preview URLs
   - Format: `clera-git-{branch-name}-{team-name}.vercel.app`
   - Enables easy testing and review before merging

3. **Rollbacks**:
   - Previous deployments are preserved
   - One-click rollback from Vercel dashboard
   - Automatic rollback configuration for failed deployments

### Backend Integration

The frontend connects to both backend components:

1. **AWS-Hosted Backend API**:
   - REST API calls to the AWS ELB endpoint:
     `https://clera--publi-3zzfi5rhjkzz-523282791.us-west-1.elb.amazonaws.com`
   - Authentication via API keys
   - Handles broker account creation and management
   - Manages ACH funding through Plaid integration
   - Environment-specific configuration with `NEXT_PUBLIC_BACKEND_API_URL`

2. **LangGraph AI Services**:
   - Communicates with AI agents hosted on LangGraph
   - WebSocket connections for real-time AI interactions
   - Setup through environment variables
   - Request routing through the AWS backend API

### Environment Management

The frontend uses different environment configurations for development stages:

1. **Local Development**:
   - `.env.local` file with development settings
   - Points to local backend and LangGraph servers
   - Supabase local emulator or development project
   - Plaid sandbox environment

2. **Staging Environment**:
   - Connected to staging backend services
   - Uses separate Supabase project
   - Plaid sandbox for testing bank connections
   - Full feature testing before production

3. **Production Environment**:
   - Production backend services integration via:
     `https://clera--publi-3zzfi5rhjkzz-523282791.us-west-1.elb.amazonaws.com`
   - Live Supabase database
   - Plaid production for real bank connections
   - Strict security policies

### Performance Monitoring

Vercel provides performance analytics:

1. **Web Vitals Monitoring**:
   - Core Web Vitals tracking
   - Real User Monitoring (RUM)
   - Page load performance metrics
   - First Input Delay (FID) and Largest Contentful Paint (LCP)

2. **Error Tracking**:
   - Runtime error logging
   - API failure reporting
   - Client-side exception handling
   - Integration with error monitoring services

3. **Usage Analytics**:
   - Bandwidth consumption
   - Request counts
   - Function invocations
   - Build minutes tracking

## Integration with Backend

The frontend application connects to the Clera backend services for:

- Financial analysis
- Portfolio management
- Trade execution
- Conversational AI features
- Brokerage account creation through Alpaca's Broker API
- ACH funding through Plaid integration or manual bank connection

### Real-Time Portfolio Updates (WebSocket)

To provide real-time updates for portfolio values, the frontend establishes a WebSocket connection with the `websocket-lb-service`.

**Connection Details:**

1.  **WebSocket URL**: The frontend connects to a secure WebSocket endpoint:
    `wss://ws.askclera.com/ws/portfolio/{accountId}`
    *   `{accountId}` is the user's specific Alpaca account ID.

2.  **Authentication**: The WebSocket connection is authenticated using a Supabase JWT.
    *   The frontend retrieves the current user's session token (JWT) from Supabase auth.
    *   This token is then appended as a query parameter to the WebSocket URL:
        `wss://ws.askclera.com/ws/portfolio/{accountId}?token=YOUR_SUPABASE_JWT`

3.  **Client-Side Implementation**: 
    *   The primary component responsible for managing this WebSocket connection and displaying real-time values is `frontend-app/components/portfolio/LivePortfolioValue.tsx`.
    *   This component handles:
        *   Constructing the correct WebSocket URL with the account ID and JWT.
        *   Establishing the connection.
        *   Handling incoming messages (e.g., updated portfolio values).
        *   Managing connection lifecycle (opening, closing, errors, retries).

**Environment Configuration:**

*   The base WebSocket URL (`wss://ws.askclera.com`) should ideally be configurable via an environment variable in the frontend's `.env.local` or deployment settings, for example:
    `NEXT_PUBLIC_WEBSOCKET_BASE_URL=wss://ws.askclera.com`
    This allows for easier changes between development, staging, and production environments.

## Company Profile Data Usage Patterns

### Overview

The frontend uses a hybrid approach for company profile data, balancing performance (cached data) with accuracy (live data) depending on the user interaction context.

### Data Sources

1. **Supabase Cache** (`/api/companies/profiles/[symbol]/route.ts`):
   - Cached company profiles from Financial Modeling Prep API
   - Updated periodically by backend scripts
   - Used for **display-only purposes** (logos, basic info)

2. **Live FMP API** (`/api/fmp/profile/[symbol]/route.ts`):
   - Direct API calls to Financial Modeling Prep
   - Always returns current data (pricing, metrics, etc.)
   - Used when **users interact** with securities

### Usage Patterns by Component

#### **Display/Search Components (Cached Data Only)**

These components use cached data via `useCompanyProfile` hook for **logos and basic display**:

- **`StockSearchBar`**: Shows cached logos in search results
- **`StockPickCard`**: Shows cached logos in "Clera's Stock Picks"  
- **`RelevantStocks`**: Shows cached logos in investment theme relevant stocks
- **Portfolio displays**: Uses cached logos for position listings

**Data Used**: Only `image` (logo URL) and `companyName` for display
**Benefits**: Fast loading, reduced API calls, better UX

#### **Interaction Components (Live Data)**

When users **click on securities**, these components fetch **live data**:

- **`StockInfoCard`**: Fetches complete live profile via `/api/fmp/profile/[symbol]`
- **Security detail modals**: All data including current pricing and metrics
- **Trade execution flows**: Uses live data for accurate pricing

**Data Used**: Complete profile including current price, market cap, financial metrics
**Benefits**: Accurate, up-to-date information for investment decisions

### Error Handling

The system gracefully handles symbols that aren't available:

1. **Pattern Detection**: Automatically detects likely unavailable symbols:
   - Canadian securities (`.TO`, `.V`)
   - Warrants (`.WS`, `.WT`)
   - Units (`.U`)
   - Rights (`.RT`)
   - Very long symbols (>5 characters)

2. **Caching Strategy**:
   - Caches successful profiles for fast access
   - Caches 404s to avoid repeated failed requests
   - Falls back to letter avatars when logos unavailable

3. **User Experience**:
   - No console errors for known unavailable symbols
   - Graceful fallbacks for missing data
   - Fast search with minimal API calls

### Implementation Details

```typescript
// Cached data usage (display only)
const { logoUrl, displayName } = useCompanyProfile(symbol);

// Live data usage (user interactions)
const response = await fetch(`/api/fmp/profile/${symbol}`);
```

### Benefits of This Approach

1. **Performance**: Search and list views load quickly with cached logos
2. **Accuracy**: User actions get current data for investment decisions  
3. **Cost Efficiency**: Reduces API calls while maintaining data freshness
4. **User Experience**: Fast UI with accurate data when it matters

This pattern ensures users see attractive, fast-loading interfaces while getting accurate data for actual investment decisions.
