# SnapTrade Webhook Setup Guide 🔧

## 🎯 Problem
When users connect their brokerage via SnapTrade, the connection succeeds but isn't being stored in our database because we're relying on redirect parameters instead of webhooks.

## ✅ Solution: Webhooks
SnapTrade sends webhooks when connections are established. We need to configure webhooks properly.

---

## 📝 Step 1: SnapTrade Dashboard Setup

### **Webhook URL to Provide:**
```
Production: https://api.askclera.com/api/snaptrade/webhook
Development: YOUR_NGROK_URL/api/snaptrade/webhook
```

### **For Local Development with ngrok:**
1. Install ngrok: `brew install ngrok` (Mac) or download from ngrok.com
2. Start your backend: `cd backend && uvicorn api_server:app --reload`
3. In another terminal, run: `ngrok http 8000`
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Use this as your webhook URL: `https://abc123.ngrok.io/api/snaptrade/webhook`

### **In SnapTrade Dashboard:**
1. Go to: https://app.snaptrade.com/dashboard
2. Navigate to **Settings** > **Webhooks**
3. Click **Add Webhook**
4. Enter your webhook URL (see above)
5. Select events to listen for:
   - ✅ `CONNECTION.CREATED` (Required!)
   - ✅ `CONNECTION.BROKEN`
   - ✅ `CONNECTION.REFRESHED`
   - ✅ `ACCOUNT_HOLDINGS_UPDATED`
   - ✅ `TRANSACTIONS_UPDATED`
6. Click **Save**
7. **IMPORTANT**: Copy the **Webhook Secret** they provide
8. Add it to your `.env` file: `SNAPTRADE_WEBHOOK_SECRET=your_secret_here`

---

## 🔐 Step 2: Update Your .env File

**Backend `.env`:**
```bash
# SnapTrade Credentials
# ⚠️ SECURITY: Replace with your actual credentials. If these were committed to git, rotate them immediately.
SNAPTRADE_CLIENT_ID=<your-client-id>
SNAPTRADE_CONSUMER_KEY=<your-consumer-key>
SNAPTRADE_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET_FROM_DASHBOARD  # ⚠️ UPDATE THIS!
```

---

## 🛠️ Step 3: Verify Webhook Endpoint is Working

### **Test Locally:**
```bash
# In terminal 1: Start backend
cd backend
source venv/bin/activate
uvicorn api_server:app --reload

# In terminal 2: Start ngrok
ngrok http 8000

# In terminal 3: Test the endpoint
curl -X POST http://localhost:8000/api/snaptrade/webhook \
  -H "Content-Type: application/json" \
  -H "x-snaptrade-signature: test" \
  -d '{
    "type": "CONNECTION.CREATED",
    "userId": "test-user",
    "authorizationId": "test-auth-id"
  }'
```

Expected response: `200 OK` (even if signature fails, endpoint should respond)

---

## 🔄 How It Works Now:

### **Connection Flow:**
1. **User clicks "Connect Brokerage Account"** →
2. **Frontend gets redirect URL from backend** →
3. **User redirected to SnapTrade portal** →
4. **User connects their brokerage (Webull, etc.)** →
5. **SnapTrade sends `CONNECTION.CREATED` webhook to our backend** ⭐
6. **Backend stores connection in database** →
7. **SnapTrade redirects user back to callback URL** →
8. **Frontend shows success and redirects to portfolio**

### **The Key:** Step 5 is where the database gets updated via webhook, NOT the redirect!

---

## 📊 Database Tables Updated by Webhook:

When `CONNECTION.CREATED` webhook is received, we update:

1. **`user_investment_accounts`**:
   - Creates new row with `snaptrade_connection_id`
   - Stores institution name, account type, etc.

2. **`user_aggregated_holdings`**:
   - Syncs all positions from the connected account
   - Updates holdings, quantities, market values

---

## 🧪 Testing the Full Flow:

1. **Set up ngrok** (for local testing)
2. **Configure webhook** in SnapTrade dashboard with ngrok URL
3. **Update `.env`** with webhook secret
4. **Restart backend**
5. **Try connecting Webull again**
6. **Check logs** for webhook received:
   ```
   📩 Received SnapTrade webhook: CONNECTION.CREATED (signature verified ✅)
   ```
7. **Verify database** has new rows in `user_investment_accounts`

---

## 🐛 Troubleshooting:

### **Issue: Webhook not being received**
- ✅ Check ngrok is running and URL is correct
- ✅ Verify webhook URL in SnapTrade dashboard
- ✅ Check backend logs for incoming requests
- ✅ Ensure port 8000 is not blocked by firewall

### **Issue: Signature verification fails**
- ✅ Verify `SNAPTRADE_WEBHOOK_SECRET` matches dashboard
- ✅ Check no extra spaces in `.env` file
- ✅ Restart backend after updating `.env`

### **Issue: Connection shown but no data**
- ✅ Check `CONNECTION.CREATED` webhook was received
- ✅ Verify `handle_connection_created` function ran successfully
- ✅ Check database for new rows
- ✅ Look for errors in backend logs

---

## 🚀 Production Deployment:

### **When deploying to production:**

1. **Update webhook URL** in SnapTrade dashboard to:
   ```
   https://api.askclera.com/api/snaptrade/webhook
   ```

2. **Ensure environment variables** are set in production:
   ```bash
   SNAPTRADE_CLIENT_ID=your_prod_client_id
   SNAPTRADE_CONSUMER_KEY=your_prod_consumer_key
   SNAPTRADE_WEBHOOK_SECRET=your_prod_webhook_secret
   ```

3. **Test webhook** using SnapTrade's "Test Webhook" button in dashboard

4. **Monitor logs** for successful webhook processing

---

## 📝 Summary:

**YOU MUST:**
1. ✅ Get webhook secret from SnapTrade dashboard
2. ✅ Add to `.env` as `SNAPTRADE_WEBHOOK_SECRET`
3. ✅ Configure webhook URL in SnapTrade (use ngrok for local dev)
4. ✅ Restart backend after updating `.env`
5. ✅ Test connection flow again

**The redirect URL is just for UX** (showing success message). The **webhook does the actual work** of storing the connection!

---

*Once webhooks are properly configured, connections will persist correctly! 🎉*

