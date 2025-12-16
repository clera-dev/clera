# Stripe CLI - Local Webhook Testing Guide

## The Problem

You can't create a webhook in Stripe Dashboard pointing to `localhost:3000` because:
- ❌ Stripe webhooks require publicly accessible URLs
- ❌ `localhost` is only accessible from your machine

## The Solution: Stripe CLI

Use the **Stripe CLI** to forward webhooks from Stripe to your localhost.

## Step 1: Install Stripe CLI

⚠️ **IMPORTANT:** You need to install the Stripe CLI on your **local machine** (not use Stripe Shell in the browser).

Stripe Shell (browser-based) does **NOT** support the `--forward-to` flag. You must install the CLI.

### On Mac (using Homebrew):

```bash
brew install stripe/stripe-cli/stripe
```

### Verify installation:

```bash
stripe --version
```

You should see something like: `stripe version X.X.X`

### If you don't have Homebrew:

1. Install Homebrew first: https://brew.sh
2. Then run: `brew install stripe/stripe-cli/stripe`

### Alternative installation methods:

- **Mac (without Homebrew):** Download from https://github.com/stripe/stripe-cli/releases
- **Windows:** Use `scoop install stripe` or download from GitHub releases
- **Linux:** See https://docs.stripe.com/stripe-cli

## Step 2: Login to Stripe

```bash
stripe login
```

This will:
1. Open your browser
2. Ask you to log in to Stripe
3. Ask you to grant access to the CLI
4. Return to terminal when complete

## Step 3: Forward Webhooks to Localhost

⚠️ **Run this in your TERMINAL (not Stripe Shell in browser):**

Open a **new terminal window** on your Mac and run:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

**Important:** 
- Keep this terminal window open while testing!
- Make sure you're running this in your **local terminal**, NOT in Stripe Shell (browser)
- The flag is `--forward-to` (with hyphens, not underscores)

### What this does:

- ✅ Creates a temporary webhook endpoint in Stripe (test mode)
- ✅ Forwards all webhook events to your `localhost:3000/api/stripe/webhook`
- ✅ Outputs a webhook signing secret (`whsec_...`)

### Example output:

```
Ready! You are using Stripe API Version [2024-XX-XX]. Your webhook signing secret is whsec_xxxxxxxxxxxxx (^C to quit)
```

## Step 4: Update Your .env.local

Copy the webhook signing secret from the terminal output and update `.env.local`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**Important:** Restart your Next.js dev server after updating `.env.local`

## Step 5: Test Your Integration

1. **Make sure these are set in `.env.local`:**
   ```
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_ID=price_... (from test mode)
   STRIPE_WEBHOOK_SECRET=whsec_... (from stripe listen output)
   ```

2. **Restart your dev server:**
   ```bash
   cd frontend-app
   npm run dev
   ```

3. **Go through the checkout flow:**
   - Connect a brokerage account
   - You'll be redirected to Stripe checkout
   - Use test card: `4242 4242 4242 4242`
   - Complete checkout

4. **Watch the Stripe CLI terminal:**
   - You should see webhook events appear
   - Example:
     ```
     2024-XX-XX XX:XX:XX   --> checkout.session.completed [evt_xxx]
     2024-XX-XX XX:XX:XX  <--  [200] POST http://localhost:3000/api/stripe/webhook [evt_xxx]
     ```

## Step 6: Monitor Events

In the terminal where `stripe listen` is running, you'll see:
- ✅ All webhook events being sent
- ✅ Your endpoint's responses (200 = success)
- ❌ Any errors from your webhook handler

## Additional Commands

### Trigger specific events manually:

```bash
# Trigger checkout completion
stripe trigger checkout.session.completed

# Trigger subscription created
stripe trigger customer.subscription.created

# Trigger payment succeeded
stripe trigger invoice.payment_succeeded
```

### Listen with specific events only:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated
```

## Important Notes

1. **Test Mode Only:** `stripe listen` only works with test mode events
2. **Keep Terminal Open:** The CLI must stay running while you test
3. **Temporary Secret:** The webhook secret from `stripe listen` is temporary
   - Don't commit it to git
   - It changes each time you run `stripe listen`
   - For production, use the webhook secret from Stripe Dashboard
4. **Port:** Make sure your Next.js app is running on port 3000 (or adjust the command)

## Troubleshooting

### "Command not found: stripe"
- Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
- Make sure you're running in your **local terminal**, not Stripe Shell (browser)

### "Received invalid flags for this command: --forward_to"
- You're using **Stripe Shell (browser)** - it doesn't support `--forward-to`
- **Solution:** Install Stripe CLI on your machine and run the command in your terminal
- Run: `brew install stripe/stripe-cli/stripe` then use your terminal (not browser)

### "403 Forbidden" errors
- Run `stripe login` to authenticate (in your terminal, not browser)

### Webhook secret doesn't work
- Make sure you copied the secret from `stripe listen` output
- Restart your dev server after updating `.env.local`

### Events not showing up
- Check that `stripe listen` is still running
- Check your Next.js terminal for errors
- Make sure the path is `/api/stripe/webhook` (not just `/webhook`)

## Summary

**DO NOT** create a webhook in the Stripe Dashboard for localhost testing.

**INSTEAD:**
1. Install Stripe CLI
2. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook`
3. Copy the webhook secret to `.env.local`
4. Restart your dev server
5. Test with the checkout flow

This is the recommended way to test webhooks locally!

