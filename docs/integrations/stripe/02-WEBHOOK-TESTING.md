# Testing Stripe Webhook

## ⚠️ Important: Test Mode vs Live Mode

- **`stripe trigger` command**: Only works in **Test Mode**, not Live Mode
- **"Send test webhook" button**: Works in both Test and Live Mode
- **Real checkout flow**: Best way to test in Live Mode

## Method 1: Send Test Webhook Button (Live Mode)

**Step-by-step to find it:**

1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Click on your webhook: **"clera-production-webhook"**
3. You should see two tabs: **"Overview"** and **"Event deliveries"**
4. Click **"Event deliveries"** tab
5. Look at the **top right** of that page - there should be a purple button
6. If you see it, click **"Send test webhook"**
7. Select event: `checkout.session.completed`
8. Click **"Send test webhook"**

**If you STILL can't find the button:**
- The button might only appear if you have at least one webhook delivery
- Try Method 3 (Real Checkout Flow) instead - it's more reliable anyway
- Or check if Stripe has moved it to a different location (sometimes it's in the three-dot menu ⋮)

## Method 2: Using Stripe Shell (Test Mode Only)

⚠️ **This only works in Test Mode, not Live Mode!**

1. Switch to **Test Mode** (toggle in top right of Stripe Dashboard)
2. Go to Stripe Dashboard → **Workbench** → **Shell** tab
3. In the shell, type:
   ```
   stripe trigger checkout.session.completed
   ```
4. Press Enter
5. This will send a test webhook event to your endpoint

## Method 3: Real Checkout Flow (Best for Live Mode Testing)

This is the **most reliable** way to test in production:

1. **Make sure your app is running** (locally or deployed)
2. **Connect a brokerage account** (SnapTrade)
3. You'll be redirected to Stripe Checkout
4. Use Stripe's **test card**: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., 12/25)
   - CVC: Any 3 digits (e.g., 123)
   - ZIP: Any 5 digits (e.g., 12345)
5. Complete the checkout
6. Check webhook was received:
   - Stripe Dashboard → Webhooks → Event deliveries
   - Should show `checkout.session.completed` event
   - Status should be ✅ **Succeeded**

## Where to See Webhook Output

### In Your Application:
1. **Terminal/Console** where your Next.js app is running
   - Look for logs like: `Payment status updated for user...`
   - Or: `Subscription checkout completed: cs_test_...`

2. **Browser Console** (if testing locally)
   - Open DevTools → Console tab
   - Look for any webhook-related logs

3. **Supabase Database**
   - Check `user_payments` table
   - Should see a new record after webhook processes

### In Stripe Dashboard:
1. Go to **Developers** → **Webhooks** → Your webhook
2. Click **"Event deliveries"** tab
3. You'll see all webhook attempts with status (success/failed)
4. Click on any event to see request/response details

## Test Commands for Stripe Shell

```bash
# Test checkout completion
stripe trigger checkout.session.completed

# Test subscription creation
stripe trigger customer.subscription.created

# Test payment success
stripe trigger invoice.payment_succeeded

# Test payment failure
stripe trigger invoice.payment_failed
```

## Verify Webhook is Working

After running a test:
1. Check Stripe Dashboard → Webhooks → Event deliveries
2. Should show status: ✅ **Succeeded** (green)
3. Check your app logs for: `Payment status updated for user...`
4. Check Supabase `user_payments` table for new record



