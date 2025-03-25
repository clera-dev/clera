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
│   │       └── create-account/ # Alpaca account creation endpoint
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
│   │   ├── checkbox.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   └── label.tsx
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

### UI Components

The frontend uses a combination of custom components and a UI library (likely Shadcn UI based on the components.json file):

- Basic UI components in `components/ui/`
- Form components with validation
- Theme switching between light and dark modes
- Typography components for consistent text styling
- Layout components for page structure

### Broker Account Onboarding

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
   - Disclosures: Regulatory required disclosures
   - Agreements: Legal agreements user must accept
   - Success: Confirmation after successful submission

3. **Alpaca Integration**:
   - Uses a utility (`utils/api/alpaca.ts`) to format data for Alpaca API
   - Makes requests through a Next.js API route (`/api/broker/create-account`)
   - Stores account information in Supabase after creation

4. **Client-Server Separation**:
   - Client components marked with "use client" directive 
   - Client components use server actions for data operations
   - Server components handle data fetching directly
   - Clear separation between client-side UI state and server-side data operations

### Styling

The application uses:

- TailwindCSS for utility-based styling
- CSS modules for component-specific styles
- A consistent theme defined in `tailwind.config.ts`
- Responsive design for different device sizes

### Third-Party Integrations

Based on the environment variables, the application integrates with:

- **Alpaca**: For brokerage account creation and management
- **Plaid**: For financial data access (investments)
- **LiveKit**: Possibly for real-time communication features

## Key Features

1. **Authentication**: Complete auth flow with sign-up, sign-in, and password reset
2. **Protected Routes**: Secure areas that require authentication
3. **Theme Switching**: Support for light and dark mode
4. **Responsive Design**: Mobile and desktop friendly UI
5. **Brokerage Onboarding**: Multi-step flow for setting up Alpaca brokerage accounts
6. **Data Persistence**: Stores onboarding progress in Supabase through server actions

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

The application is configured for deployment on Vercel (based on the presence of deployment-related components).

## Integration with Backend

The frontend application connects to the Clera backend services for:

- Financial analysis
- Portfolio management
- Trade execution
- Conversational AI features
- Brokerage account creation through Alpaca's Broker API
