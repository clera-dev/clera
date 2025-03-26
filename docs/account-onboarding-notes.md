# Alpaca Account Onboarding Analysis

## Onboarding Flow
1. User enters contact information (email, phone, address)
2. User enters personal information (name, DOB, SSN, etc.)
3. User answers disclosure questions
4. User accepts required agreements
5. Data is sent to the backend API
6. Backend creates an account through Alpaca Broker API
7. User connects their bank account through Plaid for ACH funding
8. User enters an amount to transfer from their bank to their Alpaca account
9. Funds are transferred and the user can start trading

## Required Fields

### Contact Information Step
- Email address
- Phone number
- Street address (array of strings)
- City
- State
- Postal code
- Country (defaults to USA)

### Personal Information Step
- First name
- Last name
- Date of birth
- Tax ID type (defaults to USA_SSN)
- Tax ID (SSN in format XXX-XX-XXXX)
- Country of citizenship (defaults to USA)
- Country of birth (defaults to USA)
- Country of tax residence (defaults to USA)
- Funding sources (at least one required)

### Disclosures Step
- Is control person (boolean)
- Is affiliated with exchange or FINRA (boolean)
- Is politically exposed (boolean)
- Has immediate family exposed (boolean)

### Agreements Step
- Customer agreement (required)
- Account agreement (required)
- Margin agreement (optional)
- Note: Crypto agreement was removed as not supported in California

## Data Flow and Format

### Frontend to API Route
1. User completes onboarding form
2. Frontend converts data to Alpaca format in `createAlpacaAccount` function
3. Data is sent to `/api/broker/create-account` API route
4. API route forwards request to backend with user ID

### API Route to Backend
1. API route validates auth and required fields
2. Makes request to backend `/create-alpaca-account` endpoint
3. Includes user ID and formatted Alpaca data

### Backend Processing
1. Backend extracts data from request
2. Creates Contact, Identity, Disclosures, and Agreement objects
3. Makes request to Alpaca Broker API via `broker_client.create_account()`
4. For existing accounts, retrieves account information instead of creating new one

## ACH Funding with Plaid Integration

### Overview
We've implemented a Plaid integration to allow users to connect their bank accounts with their Alpaca brokerage account for ACH funding. This implementation follows the approach described in the [Alpaca ACH Funding documentation](https://docs.alpaca.markets/docs/ach-funding).

### Implementation Details

#### Frontend Components
1. Added a "Connect with Plaid" button to the dashboard in the `BankConnectionButton` component
2. Added a dedicated "Fund your account" section on the dashboard
3. When clicked, the button calls the `/api/broker/connect-bank` API route with a redirect URI
4. The API returns a Plaid Link URL, which redirects the user to Plaid
5. User completes the Plaid flow to connect their bank account
6. Plaid redirects the user back to our application using the OAuth redirect flow
7. After connection, the `TransferForm` component is shown to enter a transfer amount
8. Transfer details and connected banks are displayed on the dashboard

#### Frontend API Routes
1. `/api/broker/connect-bank`: Initiates the Plaid connection process with redirect URI
2. `/api/broker/bank-status`: Checks for ACH relationships with Alpaca
3. `/api/broker/transfer`: Initiates an ACH transfer from the bank to Alpaca

#### Backend Implementation
1. Created utility functions in `utils/alpaca/bank_funding.py`:
   - `create_plaid_link_token`: Creates a Plaid Link token for bank account connection
   - `exchange_public_token_for_access_token`: Exchanges a Plaid public token for an access token
   - `create_processor_token`: Creates a processor token for Alpaca
   - `create_ach_relationship`: Creates an ACH relationship in Alpaca using a Plaid processor token
   - `get_ach_relationships`: Gets all ACH relationships for an Alpaca account
   - `create_direct_plaid_link_url`: Creates a direct Plaid Link URL for Alpaca ACH funding with redirect support

2. Added backend endpoints:
   - `/create-ach-relationship-link`: Creates a Plaid Link for connecting a bank account with redirect support
   - `/get-ach-relationships`: Retrieves all ACH relationships for an account
   - `/initiate-ach-transfer`: Initiates an ACH transfer from bank to Alpaca

3. Properly exported all functions in `utils/alpaca/__init__.py` for use in the API server

#### Plaid OAuth Integration
1. Implemented proper OAuth redirect flow for Plaid:
   - Added redirect URI support to the connect-bank API
   - Modified backend to include redirect URI in Plaid Link URL
   - Added OAuth state detection in the BankConnectionButton component
   - Automatically checks bank connection status after OAuth redirect
2. Used the Alpaca account ID as state for the OAuth flow to maintain context
3. Enhanced error handling for OAuth redirects and connection failures
4. Implemented improved polling logic with shorter intervals for better user experience

#### Plaid Client Initialization
1. Fixed Plaid client initialization to properly pass client_id and secret in request body
2. Uses the Alpaca account ID as the client_user_id for Plaid, creating a consistent identifier between systems
3. Added appropriate error handling and fallback mechanisms
4. Created a test script in `tests/test_plaid.py` to verify Plaid integration

#### Dashboard Integration
1. Created dashboard components in `components/dashboard/`:
   - `AccountInfoCard`: Displays Alpaca account information
   - `BankConnectionsCard`: Shows connected bank accounts with status
   - `TransfersCard`: Displays recent transfers with amount and status
2. Added informational tooltips for processing times
3. Created a responsive layout for mobile and desktop

#### UI Components
1. Added necessary UI components in `components/ui/`:
   - `card.tsx`: Card component with header, content, and footer
   - `tooltip.tsx`: Tooltip component for displaying additional information
2. Created utility functions in `lib/utils.ts`
3. Installed required dependencies:
   - `@radix-ui/react-tooltip`: For tooltip functionality
   - `clsx`: For conditional class merging
   - `tailwind-merge`: For Tailwind CSS class merging

#### Environment Variables
1. Backend `.env` additions:
   - `PLAID_CLIENT_ID`: Plaid client ID from your Plaid dashboard
   - `PLAID_SECRET`: Plaid secret for the chosen environment
   - `PLAID_ENV`: Set to 'sandbox' for testing, 'development' for production
   - `BACKEND_PUBLIC_URL`: The public URL of the backend for webhooks

2. Frontend `.env.local` additions:
   - `PLAID_CLIENT_ID`: Same as backend
   - `PLAID_SECRET`: Same as backend
   - `PLAID_ENV`: Same as backend
   - `NEXT_PUBLIC_BASE_URL`: The public URL of the frontend app for redirect URIs

### Plaid-Alpaca Flow
1. User clicks "Connect with Plaid" button on the dashboard
2. Backend creates a Plaid Link URL with redirect URI using Alpaca's built-in integration
3. User is redirected to Plaid to select their bank and authenticate
4. After authentication, Plaid redirects the user back to our app with an OAuth state ID
5. Frontend detects the redirect and starts checking for ACH relationships
6. Alpaca creates an ACH relationship with the user's bank account
7. Frontend displays the transfer form once a relationship is detected
8. User enters an amount to transfer to their Alpaca account
9. Backend creates an ACH transfer using the Alpaca Broker API
10. Transfer details are stored in Supabase and displayed on the dashboard

### Error Handling
1. The frontend displays appropriate error messages if connection fails
2. The backend has fallback mechanisms if the primary Alpaca-Plaid integration isn't available
3. We handle the case where the user's bank account is already connected
4. Transfers are validated for minimum amounts and proper formatting
5. Added better timeout handling for the bank connection process
6. Improved error feedback for OAuth redirect failures

### Best Practices and Security
1. User's Alpaca account ID is used as the client_user_id for Plaid, providing consistent identification
2. Credentials are properly managed through environment variables
3. Requests are validated and errors are properly handled
4. Supabase Row-Level Security policies ensure users can only access their own data
5. OAuth state is used to maintain security during the redirect flow

### Supabase Schema
1. `user_onboarding` table: Stores onboarding data and Alpaca account IDs
2. `user_transfers` table: Stores transfer details with Alpaca transfer IDs

## Dashboard Display
After account creation, the user is directed to their dashboard which shows:
1. Welcome message with the user's first name
2. Account information (account number, status, creation date)
3. Connected bank accounts with status and connection date
4. Recent transfers with amount, status, and processing information
5. Button to connect additional bank accounts or fund their account

The dashboard provides a seamless experience for viewing account information, connecting banks, and funding the account. Informational tooltips explain the ACH transfer process and expected processing times.

## Manual Bank Account Connection Implementation

### Overview
We've implemented a manual bank account entry feature as an alternative to Plaid integration. This allows users to directly enter their bank account details to establish an ACH relationship with Alpaca for funding.

### Implementation Details

#### Frontend Components
1. Added `ManualBankEntry.tsx` to provide an entry point with an "Enter Account Details Manually" button
2. Created `ManualBankForm.tsx` for collecting bank account information:
   - Bank account type (Checking or Savings)
   - Bank account number
   - Bank routing number (pre-filled with valid test number)
3. Reused existing `TransferForm.tsx` for entering the transfer amount after bank connection
4. Added a dedicated dashboard view after successful funding

#### Handling Alpaca ACH Relationship Constraints
Alpaca only allows one active ACH relationship per account. We've implemented several mechanisms to handle this constraint properly:
1. When a user attempts to connect a bank account, we first check if they already have an existing relationship
2. If an active relationship exists, we use that instead of creating a new one
3. If the user gets the "only one active ach relationship allowed" error, we gracefully handle it by:
   - Fetching their existing relationships
   - Using the active one if available
   - Providing a clear error message if no active relationship is found
4. This ensures a smooth user experience even with Alpaca's limitation

#### Alpaca Routing Number Requirements
For testing in Alpaca's sandbox environment, a specific routing number must be used that passes Alpaca's checksum validation:
- We pre-fill and lock the routing number field with `121000358`, which is a valid test routing number for Alpaca sandbox
- Validation is enforced at both frontend and backend levels
- This ensures that the ACH relationship creation will pass Alpaca's validation

#### Flow After Successful Connection
After successful bank connection and fund transfer:
1. User is redirected to the `/dashboard` route (not `/protected/dashboard`)
2. The dashboard page is still secure and requires authentication
3. User information is properly stored in Supabase for future reference
4. If the information isn't in Supabase, we use localStorage as a fallback and store it in Supabase
5. This ensures that all user data is properly captured and maintained

#### Reliable Data Persistence Strategy
We've implemented a robust data persistence strategy to ensure a seamless user experience:

1. **Multi-layered Storage Approach**:
   - Primary data storage in Supabase database
   - Secondary backup storage in browser localStorage
   - Explicit error handling around all storage operations

2. **Improved Transfer Process**:
   - Data is saved to localStorage before API calls
   - Detailed logging at each step of the process
   - Router uses `replace` instead of `push` to avoid navigation history issues
   - Transfer data is properly recorded in Supabase even if there are errors

3. **Enhanced Error Recovery**:
   - The dashboard page explicitly checks both Supabase and localStorage
   - Data found in localStorage is automatically saved to Supabase
   - Comprehensive logging helps identify any issues that may occur
   - Clear redirection logic prevents users from getting stuck in loops

#### Supabase Schema Compatibility
To ensure compatibility with the Supabase schema:

1. We've modified the transfer API to:
   - Remove fields that might cause schema cache issues (e.g., 'direction')
   - Use proper field names that match the actual database schema
   - Handle insertion errors gracefully without breaking the user experience
   - Store essential information even if some fields cannot be stored

2. We've implemented robust error handling that:
   - Catches database-specific errors and distinguishes them from application errors
   - Properly handles "not found" errors when querying for records that don't exist yet
   - Uses upsert operations instead of inserts to prevent duplicates
   - Provides meaningful error messages in logs for debugging

#### Automatic Redirection for Existing ACH Relationships
Since Alpaca only allows one active ACH relationship per account and limits to one transfer per day, we've improved the flow:

1. **Immediate Dashboard Access**:
   - If a user already has an active ACH relationship, they're automatically redirected to the dashboard
   - Checks for existing relationships on component mount
   - Stores relationship data in localStorage before redirection
   - Ensures users can see their account status even if they've reached transfer limits

2. **Resilient Dashboard Page**:
   - Never redirects users away from the dashboard if data is missing
   - Provides sensible defaults when data cannot be loaded
   - Makes multiple attempts to load data from different sources
   - Keeps users in the secured area of the application at all times

#### Recent Bug Fixes and Improvements

1. **User Name Display Fix**:
   - Updated dashboard to fetch user's name from `user_onboarding` table's `onboarding_data` JSON field
   - Added parsing for both string and object JSON data
   - Implemented fallback to profiles table if onboarding data not available
   - Ensured consistent "Hello, [First Name]" greeting with proper capitalization

2. **Duplicate Transfer Prevention**:
   - Added check for existing transfers before creating new ones
   - Implemented lookup by user_id, relationship_id, and transfer_id to prevent duplicates
   - Added client-side check for existing transfer IDs in localStorage
   - Prevents duplicate API calls when user refreshes or navigates back to the page

3. **Error Handling Improvements**:
   - Enhanced error object handling to prevent empty object errors in console
   - Added proper error message extraction from various error formats
   - Added more robust checks for database query results
   - Implemented proper handling of "not found" vs. actual error conditions

4. **Database Table Dependency Management**:
   - Updated code to handle missing database tables gracefully
   - Implemented complete fallback to localStorage when tables don't exist
   - Removed database operations that would fail if tables don't exist
   - Added detailed logging to help diagnose database-related issues

5. **Portfolio Display**:
   - Added Portfolio section to the dashboard showing current cash balance
   - Implemented direct Alpaca API integration to fetch account cash balance
   - Used Alpaca's transfer and account endpoints to retrieve accurate balances
   - Added robust error handling and loading states for better user experience
   - No backend changes required as all communication happens through the frontend API route

#### Required Database Tables

To fully support the bank connection and transfer functionality, the following Supabase tables need to be created:

1. **user_onboarding**: Stores user onboarding data (already exists)
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
   -- Add appropriate RLS policies
   ALTER TABLE public.user_bank_connections ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can view their own bank connections"
     ON public.user_bank_connections
     FOR SELECT
     USING (auth.uid() = user_id);
   CREATE POLICY "Users can create their own bank connections"
     ON public.user_bank_connections
     FOR INSERT
     WITH CHECK (auth.uid() = user_id);
   ```

3. **user_transfers**: Stores ACH transfer information (already exists)
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
   -- Add appropriate RLS policies
   ALTER TABLE public.user_transfers ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can view their own transfers"
     ON public.user_transfers
     FOR SELECT
     USING (auth.uid() = user_id);
   CREATE POLICY "Users can create their own transfers"
     ON public.user_transfers
     FOR INSERT
     WITH CHECK (auth.uid() = user_id);
   ```

The application has been updated to gracefully handle missing tables by using localStorage data as a fallback, but for full functionality, these tables should be created in the Supabase database.

These improvements ensure a more stable and consistent user experience while preventing data duplication and improving error handling throughout the application.

#### Backend Implementation
1. Created `manual_bank_funding.py` in `utils/alpaca/` with functions:
   - `create_ach_relationship_manual`: Creates an ACH relationship using bank details
   - `create_ach_transfer`: Initiates transfers from bank to Alpaca account
   - `get_ach_relationships`: Gets all ACH relationships for an account

2. Added API endpoints in `api_server.py`:
   - `/create-ach-relationship-manual`: Creates an ACH relationship manually
   - `/initiate-ach-transfer`: Initiates an ACH transfer with the provided bank details

#### Frontend API Routes
1. Added `/api/broker/connect-bank-manual`: API route for manual bank connection
2. Updated `/api/broker/transfer`: Handles transfers after manual connection

#### UI Components
1. Created necessary UI components including select fields for account type
2. Implemented validation for bank account details
3. Added error handling and success messaging

#### User Flow
1. User completes account onboarding
2. On dashboard, user clicks "Enter Account Details Manually"
3. User enters bank account details (type, account number, routing number)
4. User specifies amount to transfer (minimum $1)
5. User is directed to dashboard showing account details and funding status
6. Transfers are tracked in the database and displayed on the dashboard

#### Security Considerations
1. API key validation for all backend endpoints
2. Masking of sensitive bank account details in logs
3. Server-side validation of all user inputs

### Integration with Alpaca
The implementation uses Alpaca's Broker API directly through the alpaca-py SDK:
1. Creates an ACH relationship with the bank account details
2. Processes incoming transfers using the relationship ID
3. Tracks ACH relationships and transfers in the Supabase database

This manual bank account connection provides a streamlined alternative to Plaid while still allowing users to fund their accounts through ACH transfers. 