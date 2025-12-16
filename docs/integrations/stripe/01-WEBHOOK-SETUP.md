# Stripe Webhook Configuration Guide

## 🎯 EXACT CLICKS - Step by Step

Based on your screenshots, here's exactly what to click:

### Step 1: Navigate to Webhooks
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Click **"Developers"** in the left sidebar
3. Click **"Webhooks"** (or "Event destinations" if you see that)

### Step 2: Create New Event Destination
1. Click **"Add endpoint"** button (top right) or **"Create event destination"**
2. You'll see the "Create an event destination" page

### Step 3: Configure Endpoint URL
1. In the **"Endpoint URL"** field, enter:
   ```
   https://app.askclera.com/api/stripe/webhook
   ```
   ⚠️ **Use your web app domain (`app.askclera.com`), NOT the landing page (`www.askclera.com`)**
   - Must be HTTPS (required by Stripe)

### Step 4: Select Events Source (Left Sidebar - Step 1)
1. Under **"Events from"** section (main content area):
   - ✅ **CLICK the card labeled "Your account"** 
   - (The one with icon showing single central node connected to 3 smaller nodes)
   - ❌ Do NOT click "Connected and v2 accounts"

### Step 5: Select API Version
1. Scroll down to **"API version"** dropdown
2. Select **"2025-04-30.basil"** (or latest available)
   - This matches your Stripe SDK version

### Step 6: Select Events (Left Sidebar - Step 1, Main Content)
1. You'll see two tabs: **"All events"** and **"Selected events"**
2. **CLICK the "Selected events" tab** (shows count like "25")
3. **CLICK "Select events"** button (or search box)
4. In the search box, type each event name and check the box:

   **Type and select these 6 events:**
   
   Search: `checkout.session.completed`
   - ✅ Check the box next to `checkout.session.completed`
   
   Search: `customer.subscription.created`
   - ✅ Check the box next to `customer.subscription.created`
   
   Search: `customer.subscription.updated`
   - ✅ Check the box next to `customer.subscription.updated`
   
   Search: `customer.subscription.deleted`
   - ✅ Check the box next to `customer.subscription.deleted`
   
   Search: `invoice.payment_succeeded`
   - ✅ Check the box next to `invoice.payment_succeeded`
   
   Search: `invoice.payment_failed`
   - ✅ Check the box next to `invoice.payment_failed`

5. After selecting all 6 events, click **"Continue →"** button (bottom right)

### Step 7: Choose Destination Type (Left Sidebar - Step 2)
1. Select **"Webhook endpoint"** or **"HTTP endpoint"**
2. Click **"Continue →"**

### Step 8: Configure Destination (Left Sidebar - Step 3)
1. **Destination name**: Keep the auto-generated name (e.g., "upbeat-glow") or enter something like "Clera Production Webhook"
2. **Endpoint URL**: Enter exactly:
   ```
   https://app.askclera.com/api/stripe/webhook
   ```
   ⚠️ **Important**: Use `app.askclera.com` (your web app), NOT `www.askclera.com` (landing page)
3. **Description** (optional): Enter something like "Stripe webhook for Clera Plus subscription payments"
4. Review your settings
5. Click **"Create destination"** button (purple button, bottom right) to save

### Step 9: Get Webhook Secret ⚠️ CRITICAL
1. After creating, you'll see the endpoint details page
2. Find **"Signing secret"** section
3. Click **"Reveal"** button next to it
4. **COPY the secret** (starts with `whsec_`)
5. Add to your `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_copied_secret_here
   ```
   ⚠️ **Keep this secret secure - never commit it to git!**

### Step 10: Test Webhook (Recommended)
1. On the webhook endpoint details page
2. Click **"Send test webhook"** button
3. Select `checkout.session.completed` from dropdown
4. Click **"Send test webhook"**
5. Check your application logs/console to verify receipt

## Events We Handle

Our webhook handler processes these events:

1. **checkout.session.completed** - When user completes checkout
2. **customer.subscription.created** - When subscription is created
3. **customer.subscription.updated** - When subscription status changes
4. **customer.subscription.deleted** - When subscription is canceled
5. **invoice.payment_succeeded** - When subscription payment succeeds
6. **invoice.payment_failed** - When subscription payment fails

## Production Checklist

- [ ] Webhook endpoint URL is correct (HTTPS required)
- [ ] All 6 events are selected
- [ ] Webhook secret is added to environment variables
- [ ] Database migration `013_create_user_payments.sql` has been run
- [ ] `STRIPE_PRICE_ID` is set in environment variables
- [ ] Test webhook was sent and received successfully

## Local Testing

For local development, use Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

This will output a webhook secret. Use that for `STRIPE_WEBHOOK_SECRET` in local development.



