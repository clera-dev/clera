# Stripe Integration Documentation

This directory contains documentation for the Stripe payment integration, including subscription management for Clera Plus.

## Documentation Files

- **[00-QUICK-START.md](./00-QUICK-START.md)** - Quick reference: Test vs Live mode, test cards, and what happens when you checkout
- **[01-WEBHOOK-SETUP.md](./01-WEBHOOK-SETUP.md)** - Step-by-step guide for configuring Stripe webhooks in the dashboard (production)
- **[02-WEBHOOK-TESTING.md](./02-WEBHOOK-TESTING.md)** - Guide for testing webhooks in both test and live modes
- **[03-PRODUCTION-CHECKLIST.md](./03-PRODUCTION-CHECKLIST.md)** - Production readiness checklist and implementation verification
- **[04-LOCAL-TESTING-CLI.md](./04-LOCAL-TESTING-CLI.md)** - Using Stripe CLI to test webhooks on localhost

## Quick Start

1. **For local testing**: Use Stripe CLI - Follow [04-LOCAL-TESTING-CLI.md](./04-LOCAL-TESTING-CLI.md)
2. **Understand Test vs Live Mode**: Read [00-QUICK-START.md](./00-QUICK-START.md)
3. **Set up production webhook**: Follow [01-WEBHOOK-SETUP.md](./01-WEBHOOK-SETUP.md)
4. **Test webhook**: Follow [02-WEBHOOK-TESTING.md](./02-WEBHOOK-TESTING.md)
5. **Verify production readiness**: Check [03-PRODUCTION-CHECKLIST.md](./03-PRODUCTION-CHECKLIST.md)

## Integration Overview

The Stripe integration handles:
- **Subscription payments** for Clera Plus ($10/month)
- **Webhook events** for payment status updates
- **Access control** - only active subscribers can access the platform
- **Payment flow** - redirects users to Stripe checkout after brokerage connection

## Related Files

- API Routes: `frontend-app/app/api/stripe/`
- Database Migration: `backend/migrations/013_create_user_payments.sql`
- Success/Cancel Pages: `frontend-app/app/stripe/`

