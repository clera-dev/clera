# Stripe Integration - Quick Start Guide

## 🔍 How to Tell if You're in Test Mode or Live Mode

Check your API keys in `.env.local`:

### Live Mode Keys:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_live_...`
- `STRIPE_SECRET_KEY` starts with `sk_live_...`

### Test Mode Keys:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_test_...`
- `STRIPE_SECRET_KEY` starts with `sk_test_...`

**Your current setup:** You're using **LIVE mode** keys (`pk_live_` and `sk_live_`)

## ⚠️ Important: Test Cards in Live Mode

**Critical:** Stripe **DOES NOT** allow test cards (like `4242 4242 4242 4242`) in **LIVE mode**.

**Error you'll see:** "Your card was declined. Your request was in live mode, but used a known test card."

**What this means:**
- ❌ Test cards only work in **Test Mode**, not Live Mode
- ✅ To test with test cards, you must use **Test Mode** keys
- ⚠️ In Live Mode, you can only use **real credit cards** (which will charge real money)

## 🎯 Recommended Testing Approach

### Option 1: Test in Test Mode First (STRONGLY RECOMMENDED)

**You MUST use Test Mode to test with test cards.**

1. **Switch to Test Mode:**
   - Go to Stripe Dashboard → Toggle "Test mode" (top right, toggle switch)
   - Get your test keys from: Developers → API keys (will show `pk_test_` and `sk_test_`)
   - Update `.env.local` with test keys:
     ```
     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
     STRIPE_SECRET_KEY=sk_test_...
     ```
   - Create a test webhook endpoint (separate from live)
   - Use test Price ID (create product/price in test mode)
   - Get test webhook secret

2. **Test the full flow** with test keys and test card `4242 4242 4242 4242`
3. **Once everything works, switch back to live mode** for production

### Option 2: Test in Live Mode (NOT RECOMMENDED for initial testing)
- ⚠️ **Requires a real credit card** (will charge real money)
- ⚠️ **Test cards don't work** - you'll get the error you just saw
- ✅ Only use this for final production verification
- ⚠️ Make sure your webhook endpoint is configured for live mode

## ✅ What to Do Right Now

**You're seeing the error because test cards don't work in live mode.**

### Immediate Solution: Switch to Test Mode

1. **Go to Stripe Dashboard** → Toggle "Test mode" ON (top right)
2. **Get Test Mode Keys:**
   - Developers → API keys
   - Copy the **Test mode** keys (start with `pk_test_` and `sk_test_`)
3. **Update `.env.local`:**
   ```
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (test key)
   STRIPE_SECRET_KEY=sk_test_... (test key)
   ```
4. **Create Test Product/Price:**
   - In Test Mode, go to Products → Create "Clera Plus" → Add $10/month price
   - Copy the test Price ID (starts with `price_`)
   - Update `STRIPE_PRICE_ID` in `.env.local`
5. **Create Test Webhook:**
   - In Test Mode, create webhook endpoint pointing to `localhost:3000/api/stripe/webhook`
   - Copy test webhook secret
   - Update `STRIPE_WEBHOOK_SECRET` in `.env.local`
6. **Restart your dev server** (to load new env vars)
7. **Try checkout again** - test card `4242 4242 4242 4242` will work now!

### Alternative: Use Real Card in Live Mode (NOT RECOMMENDED)
- ⚠️ This will charge real money ($10)
- ⚠️ Only do this for final production verification
- ✅ You can refund it later if needed

## 🚨 Important Notes

- **Test cards:** Only work in **Test Mode**, NOT in Live Mode (you'll get the error you just saw)
- **Webhook:** Must match the mode you're using (test webhook for test keys, live webhook for live keys)
- **Price ID:** Must be from the **same mode** as your keys (test keys = test price ID, live keys = live price ID)
- **Webhook secret:** Must match the webhook endpoint mode (test webhook = test secret, live webhook = live secret)
- **For testing:** Always use Test Mode first, then switch to Live Mode for production

## 📝 Quick Checklist for Test Mode

Before completing checkout:
- [ ] Toggle Stripe Dashboard to **Test Mode** (top right)
- [ ] Verify you're using test keys (`pk_test_`, `sk_test_`) in `.env.local`
- [ ] Verify your `STRIPE_PRICE_ID` is from **test mode** (create product/price in test mode)
- [ ] Verify your webhook endpoint is configured for **test mode** (pointing to `localhost:3000`)
- [ ] Verify `STRIPE_WEBHOOK_SECRET` is from your **test webhook**
- [ ] Restart your dev server to load new env vars

After completing checkout:
- [ ] Check Stripe Dashboard (Test Mode) → Subscriptions (should see new subscription)
- [ ] Check Stripe Dashboard → Webhooks → Event deliveries (should see event)
- [ ] Check your terminal logs (should see `Payment status updated for user...`)
- [ ] Check Supabase `user_payments` table (should see new record)
- [ ] Verify you're redirected to `/portfolio`

## 📝 Checklist for Live Mode (Production)

Only do this after testing in Test Mode:
- [ ] Switch back to Live Mode keys (`pk_live_`, `sk_live_`)
- [ ] Use Live Mode Price ID
- [ ] Use Live Mode webhook endpoint (pointing to `https://app.askclera.com/api/stripe/webhook`)
- [ ] Use Live Mode webhook secret
- [ ] **Use a real credit card** (test cards won't work)
- [ ] Verify everything works in production

