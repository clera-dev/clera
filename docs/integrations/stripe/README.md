# Stripe Integration Documentation

This directory contains documentation for the Stripe payment integration, including subscription management for Clera Plus.

## Documentation Files

- **[00-QUICK-START.md](./00-QUICK-START.md)** - Quick reference: Test vs Live mode, test cards, and what happens when you checkout
- **[01-WEBHOOK-SETUP.md](./01-WEBHOOK-SETUP.md)** - Step-by-step guide for configuring Stripe webhooks in the dashboard (production)
- **[02-WEBHOOK-TESTING.md](./02-WEBHOOK-TESTING.md)** - Guide for testing webhooks in both test and live modes
- **[03-PRODUCTION-CHECKLIST.md](./03-PRODUCTION-CHECKLIST.md)** - Production readiness checklist and implementation verification
- **[04-LOCAL-TESTING-CLI.md](./04-LOCAL-TESTING-CLI.md)** - Using Stripe CLI to test webhooks on localhost
- **[05-TROUBLESHOOTING.md](./05-TROUBLESHOOTING.md)** - Troubleshooting common issues
- **[06-MCP-INTEGRATION.md](./06-MCP-INTEGRATION.md)** - Using Stripe MCP for AI agent integration with Cursor

## Quick Start

1. **For local testing**: Use Stripe CLI - Follow [04-LOCAL-TESTING-CLI.md](./04-LOCAL-TESTING-CLI.md)
2. **Understand Test vs Live Mode**: Read [00-QUICK-START.md](./00-QUICK-START.md)
3. **Set up production webhook**: Follow [01-WEBHOOK-SETUP.md](./01-WEBHOOK-SETUP.md)
4. **Set up Customer Portal**: See [Customer Portal Setup](#customer-portal-setup) below
5. **Test webhook**: Follow [02-WEBHOOK-TESTING.md](./02-WEBHOOK-TESTING.md)
6. **Verify production readiness**: Check [03-PRODUCTION-CHECKLIST.md](./03-PRODUCTION-CHECKLIST.md)
7. **Enable AI agent access**: Set up Stripe MCP - Follow [06-MCP-INTEGRATION.md](./06-MCP-INTEGRATION.md)

## AI Agent Integration (MCP)

The Stripe MCP (Model Context Protocol) allows AI tools like Cursor to interact directly with your Stripe account. This enables natural language commands for subscription management, customer operations, and more.

**Quick setup** - Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "stripe": {
      "url": "https://mcp.stripe.com"
    }
  }
}
```

For full documentation, see [06-MCP-INTEGRATION.md](./06-MCP-INTEGRATION.md).

## Integration Overview

The Stripe integration handles:
- **Subscription payments** for Clera Plus ($10/month)
- **Webhook events** for payment status updates
- **Access control** - only active subscribers can access the platform
- **Payment flow** - redirects users to Stripe checkout after brokerage connection
- **Customer Portal** - allows users to manage their subscription from the dashboard

## Customer Portal Setup

The Customer Portal allows users to:
- Update payment methods
- View billing history and download invoices
- Cancel or modify their subscription

### Configuration Steps (Stripe Dashboard)

1. Go to **Stripe Dashboard** → **Settings** → **Billing** → **Customer Portal**
2. Enable the Customer Portal
3. Configure the following settings:
   - **Business information**: Add your company name and support email
   - **Invoice history**: Enable to allow customers to view past invoices
   - **Payment methods**: Enable to allow updating payment methods
   - **Subscriptions**: 
     - Enable "Cancel subscriptions" to allow users to cancel
     - Optionally enable "Switch plans" if you have multiple tiers
   - **Branding**: Customize colors to match Clera's UI (optional)
4. Save your configuration

### Code Implementation

- **API Route**: `frontend-app/app/api/stripe/create-portal-session/route.ts`
- **UI Component**: `frontend-app/components/dashboard/SubscriptionManagement.tsx`
- **Dashboard Integration**: The component is rendered in `/dashboard` page

### How It Works

1. User clicks "Manage Subscription" on the dashboard
2. Frontend calls `/api/stripe/create-portal-session`
3. API retrieves user's `stripe_customer_id` from `user_payments` table
4. API creates a Stripe billing portal session via `stripe.billingPortal.sessions.create()`
5. User is redirected to Stripe's hosted portal
6. After changes, user returns to `/dashboard`
7. Any subscription changes trigger webhooks (already handled by existing webhook route)

## Related Files

- API Routes: `frontend-app/app/api/stripe/`
  - `create-checkout-session/` - Creates checkout for new subscriptions
  - `create-portal-session/` - Creates customer portal session
  - `check-payment-status/` - Checks if user has active subscription
  - `webhook/` - Handles Stripe webhook events
- UI Components: `frontend-app/components/dashboard/SubscriptionManagement.tsx`
- Database Migration: `backend/migrations/013_create_user_payments.sql`
- Success/Cancel Pages: `frontend-app/app/stripe/`

