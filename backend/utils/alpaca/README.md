# Alpaca Utilities

This directory contains utility functions for interacting with the Alpaca Broker API.

## Account Creation

The `create_account.py` module provides utilities for creating Alpaca brokerage accounts:

- `get_broker_client`: Get an Alpaca broker client instance
- `create_alpaca_account`: Create a new Alpaca account
- `find_account_by_email`: Find an existing Alpaca account by email
- `create_or_get_alpaca_account`: Create a new account or get an existing one

## Bank Funding

The `bank_funding.py` module provides utilities for connecting bank accounts for ACH funding using Plaid:

- `create_plaid_link_token`: Create a Plaid Link token for bank account connection
- `exchange_public_token_for_access_token`: Exchange a Plaid public token for an access token
- `create_processor_token`: Create a processor token for Alpaca
- `create_ach_relationship`: Create an ACH relationship in Alpaca using a Plaid processor token
- `get_ach_relationships`: Get all ACH relationships for an Alpaca account
- `create_direct_plaid_link_url`: Create a direct Plaid Link URL for Alpaca ACH funding

## Setup

### Alpaca Configuration

1. Sign up for an Alpaca Broker API account at https://alpaca.markets/
2. Copy your API key and secret to the `.env` file:

```
BROKER_API_KEY=your_alpaca_broker_api_key
BROKER_SECRET_KEY=your_alpaca_broker_secret_key
```

### Plaid Configuration

1. Sign up for a Plaid account at https://plaid.com/
2. Create a new API key in the Plaid dashboard
3. Enable the Alpaca processor in your Plaid dashboard
4. Copy your client ID and secret to the `.env` file:

```
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_sandbox_secret
PLAID_ENV=sandbox
BACKEND_PUBLIC_URL=http://localhost:8000
```

Note: For production, you'll need to update `PLAID_ENV` to "development" or "production" and get the appropriate Plaid API credentials.

## Usage

### ACH Integration Flow

The ACH integration with Plaid and Alpaca follows these steps:

1. User clicks "Connect with Plaid" button on the frontend
2. Frontend calls the `/api/broker/connect-bank` API route
3. The API route gets the user's Alpaca account ID from Supabase
4. The API route calls the backend endpoint `/create-ach-relationship-link`
5. The backend endpoint uses `create_direct_plaid_link_url` to get a Plaid Link URL
6. The frontend opens the Plaid Link URL for the user
7. User selects their bank and authenticates
8. Plaid sends the processor token to Alpaca
9. Alpaca creates an ACH relationship with the user's bank
10. User can now fund their brokerage account via ACH transfers

### Testing the Plaid Integration

You can test the Plaid integration using the `test_plaid.py` script:

```bash
python test_plaid.py
```

This script will:

1. Load environment variables from `.env`
2. Initialize a Plaid client
3. Create a Plaid Link token
4. Generate a Plaid Link URL
5. Output the link token and URL for testing 