gti# SnapTrade Trading Implementation Guide

## 🎯 Objective

Enable trade execution through SnapTrade-connected brokerage accounts with a production-grade, intuitive UI that matches the platform's aesthetic.

## ✅ What's Been Completed

### 1. Backend Infrastructure

#### `backend/services/snaptrade_trading_service.py` ✅
**Production-grade trading service with:**
- `check_order_impact()` - Validates order and shows impact before execution
- `place_order()` - Places trades via SnapTrade API (with trade_id or force order)
- `cancel_order()` - Cancels open orders
- `get_account_orders()` - Fetches orders for an account
- `get_universal_symbol_id()` - Looks up SnapTrade symbol IDs
- `get_user_credentials()` - Retrieves SnapTrade user credentials

**Key Features:**
- Two methods of order placement (with/without impact check)
- Proper error handling and logging
- Support for Market, Limit, Stop, and StopLimit orders
- Notional value (dollar amount) and units (shares) support

#### `backend/api_server.py` - `/api/trade` endpoint ✅
**Updated to:**
- Detect SnapTrade vs Alpaca accounts automatically
- Route to appropriate trading service
- Use `SnapTradeTradingService` for SnapTrade accounts
- Maintain backward compatibility with Alpaca trades

#### `frontend-app/app/api/snaptrade/trade-enabled-accounts/route.ts` ✅
**Updated to:**
- Filter accounts by `connection_type='trade'`
- Return only trade-enabled SnapTrade connections
- Include Alpaca account for hybrid mode
- Provide consistent account format with buying power

## 🚧 What Remains To Be Done

### 2. Frontend - Portfolio Page (`/portfolio`)

#### Remove Feature Flag Wrapper ❌
**File:** `frontend-app/app/portfolio/page.tsx`

**Current State:**
```typescript
// Buy/Sell buttons are wrapped in feature flag check
{featureFlags.SNAPTRADE_TRADE_EXECUTION && (
  <Button onClick={() => handleInvestClick(row.getValue('symbol'))}>
    Buy
  </Button>
)}
```

**Required Change:**
```typescript
// Remove feature flag wrapper - trading is now production-ready
<Button onClick={() => handleInvestClick(row.getValue('symbol'))}>
  Buy
</Button>
```

**Impact:**
- Buy/Sell buttons will show for all users with trade-enabled accounts
- No functional change (OrderModal already handles account selection)

### 3. Frontend - Order Modal

#### Update OrderModal to Show Account Selection ❌
**File:** `frontend-app/components/invest/OrderModal.tsx`

**Current Behavior:**
- Already fetches trade accounts from `/api/snaptrade/trade-enabled-accounts`
- Already has account selection UI
- Already validates buying power

**Required Enhancements:**
1. **Display Brokerage Name Prominently**
   ```typescript
   <Select value={selectedAccount} onValueChange={setSelectedAccount}>
     <SelectTrigger>
       <SelectValue placeholder="Select brokerage account" />
     </SelectTrigger>
     <SelectContent>
       {tradeAccounts.map((account) => (
         <SelectItem key={account.id} value={account.account_id}>
           <div className="flex items-center justify-between w-full">
             <span className="font-medium">{account.institution_name}</span>
             <span className="text-sm text-muted-foreground">
               ${account.buying_power.toLocaleString()} available
             </span>
           </div>
         </SelectItem>
       ))}
     </SelectContent>
   </Select>
   ```

2. **Show Account Selection for Multiple Accounts**
   - If user has only 1 trade-enabled account → auto-select it
   - If user has 2+ trade-enabled accounts → show selection modal
   - Display buying power for each account

3. **Visual Polish**
   - Add icons for each brokerage (Webull, Robinhood, etc.)
   - Use glassmorphic card design
   - Animate selection with Framer Motion
   - Match existing platform aesthetic (dark theme, gradients)

### 4. Frontend - Invest Page (`/invest`)

#### Update Invest Page for Account Selection ❌
**File:** `frontend-app/app/invest/page.tsx`

**Current State:**
- Hardcoded to use Alpaca account only
- No account selection UI

**Required Changes:**
1. **Fetch Trade-Enabled Accounts**
   ```typescript
   const [tradeAccounts, setTradeAccounts] = useState([]);
   
   useEffect(() => {
     fetchTradeAccounts();
   }, []);
   
   const fetchTradeAccounts = async () => {
     const response = await fetch('/api/snaptrade/trade-enabled-accounts');
     const data = await response.json();
     setTradeAccounts([...data.accounts, data.alpaca_account].filter(Boolean));
   };
   ```

2. **Add Account Selector in InvestmentCard**
   - Show dropdown if multiple accounts
   - Display buying power for selected account
   - Pass `selectedAccount` to OrderModal

3. **Persist Account Selection**
   - Remember last-used account in localStorage
   - Auto-select for repeat trades

### 5. Frontend - Pending Orders (SnapTrade)

#### Update Orders Fetching ❌
**Files:**
- `frontend-app/app/portfolio/page.tsx`
- `backend/routes/snaptrade_routes.py`

**Current State:**
- `/api/snaptrade/pending-orders` endpoint exists
- Returns orders from all SnapTrade accounts
- Frontend already displays orders in TransactionsTable

**Required:**
1. **Add Account Name to Orders**
   ```typescript
   // Already in OrderData interface
   interface OrderData {
     account_name?: string;  // ✅ Already exists
   }
   ```

2. **Backend Enhancement**
   Update `backend/routes/snaptrade_routes.py`:
   ```python
   @router.get("/pending-orders")
   async def get_pending_orders(user_id: str = Depends(get_authenticated_user_id)):
       # Use new SnapTradeTradingService
       from services.snaptrade_trading_service import get_snaptrade_trading_service
       trading_service = get_snaptrade_trading_service()
       
       # Get all trade-enabled accounts
       accounts = TradeRoutingService.get_trading_accounts(user_id)
       snaptrade_accounts = [a for a in accounts if a['account_type'] == 'snaptrade']
       
       all_orders = []
       for account in snaptrade_accounts:
           result = trading_service.get_account_orders(
               user_id=user_id,
               account_id=account['account_id'],
               status='OPEN'  # Only pending orders
           )
           
           if result['success']:
               for order in result['orders']:
                   all_orders.append({
                       **order,
                       'account_name': account['institution_name']
                   })
       
       return {"orders": all_orders}
   ```

### 6. Frontend - Order Cancellation

#### Add Cancel Button for SnapTrade Orders ❌
**File:** `frontend-app/components/portfolio/TransactionsTable.tsx`

**Current State:**
- Has cancel UI for Alpaca orders
- No cancel functionality for SnapTrade orders

**Required:**
1. **Add Cancel Handler**
   ```typescript
   const handleCancelSnapTradeOrder = async (
     orderId: string,
     accountId: string
   ) => {
     const response = await fetch('/api/snaptrade/cancel-order', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ orderId, accountId })
     });
     
     if (response.ok) {
       toast.success('Order cancelled successfully');
       refreshOrders();
     }
   };
   ```

2. **Backend Endpoint**
   Create `frontend-app/app/api/snaptrade/cancel-order/route.ts`:
   ```typescript
   export async function POST(request: Request) {
     const { orderId, accountId } = await request.json();
     
     // Forward to backend
     const response = await fetch(
       `${process.env.BACKEND_API_URL}/api/snaptrade/cancel-order`,
       {
         method: 'POST',
         headers: {
           'X-API-Key': process.env.BACKEND_API_KEY,
           'Authorization': `Bearer ${session.access_token}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({ orderId, accountId })
       }
     );
     
     return NextResponse.json(await response.json());
   }
   ```

3. **Backend Route**
   Add to `backend/routes/snaptrade_routes.py`:
   ```python
   @router.post("/cancel-order")
   async def cancel_snaptrade_order(
       order_id: str,
       account_id: str,
       user_id: str = Depends(get_authenticated_user_id)
   ):
       from services.snaptrade_trading_service import get_snaptrade_trading_service
       trading_service = get_snaptrade_trading_service()
       
       result = trading_service.cancel_order(
           user_id=user_id,
           account_id=account_id,
           brokerage_order_id=order_id
       )
       
       return result
   ```

## 🎨 UI/UX Requirements

### Design Principles
1. **Intuitive** - User should understand what's happening at each step
2. **Aesthetic** - Match existing dark theme with glassmorphic cards
3. **Responsive** - Works on mobile and desktop
4. **Fast** - No unnecessary API calls, use caching

### Key UI Elements

#### Account Selector
```typescript
<div className="glassmorphic-card p-6">
  <h3 className="text-lg font-semibold mb-4">Select Account</h3>
  
  {tradeAccounts.map((account) => (
    <motion.div
      key={account.id}
      whileHover={{ scale: 1.02 }}
      className="account-card cursor-pointer p-4 mb-3 rounded-lg border border-gray-700 hover:border-primary"
      onClick={() => setSelectedAccount(account.id)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Brokerage Icon */}
          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
            {getBrokerageIcon(account.institution_name)}
          </div>
          
          <div>
            <p className="font-medium">{account.institution_name}</p>
            <p className="text-sm text-muted-foreground">{account.account_name}</p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Buying Power</p>
          <p className="font-semibold text-green-400">
            ${account.buying_power.toLocaleString()}
          </p>
        </div>
      </div>
    </motion.div>
  ))}
</div>
```

#### Order Confirmation
```typescript
<div className="order-confirmation p-6 border border-primary rounded-lg">
  <h4 className="text-lg font-semibold mb-4">Review Order</h4>
  
  <div className="space-y-3">
    <div className="flex justify-between">
      <span className="text-muted-foreground">Action</span>
      <span className="font-medium">{orderType}</span>
    </div>
    
    <div className="flex justify-between">
      <span className="text-muted-foreground">Symbol</span>
      <span className="font-medium">{symbol}</span>
    </div>
    
    <div className="flex justify-between">
      <span className="text-muted-foreground">Amount</span>
      <span className="font-medium">${notionalAmount.toLocaleString()}</span>
    </div>
    
    <div className="flex justify-between">
      <span className="text-muted-foreground">Est. Shares</span>
      <span className="font-medium">{estimatedShares.toFixed(4)}</span>
    </div>
    
    <div className="flex justify-between">
      <span className="text-muted-foreground">Est. Price</span>
      <span className="font-medium">${estimatedPrice.toFixed(2)}</span>
    </div>
    
    <div className="flex justify-between">
      <span className="text-muted-foreground">Account</span>
      <span className="font-medium">{selectedAccountName}</span>
    </div>
  </div>
  
  <Button className="w-full mt-6" onClick={handlePlaceOrder}>
    Place Order
  </Button>
</div>
```

## 🧪 Testing Checklist

### Backend Testing
- [ ] Test `SnapTradeTradingService.place_order()` with Market order
- [ ] Test `SnapTradeTradingService.place_order()` with Limit order
- [ ] Test `SnapTradeTradingService.cancel_order()`
- [ ] Test `/api/trade` endpoint with SnapTrade account
- [ ] Test `/api/trade` endpoint with Alpaca account
- [ ] Test error handling (insufficient funds, invalid symbol)

### Frontend Testing
- [ ] Test account selection UI with 1 account (auto-select)
- [ ] Test account selection UI with 2+ accounts (show dropdown)
- [ ] Test order placement from `/portfolio` page (Buy button)
- [ ] Test order placement from `/portfolio` page (Sell button)
- [ ] Test order placement from `/invest` page
- [ ] Test pending orders display with SnapTrade orders
- [ ] Test order cancellation for SnapTrade orders
- [ ] Test buying power validation
- [ ] Test responsive design (mobile/desktop)

### Integration Testing
- [ ] End-to-end: Connect SnapTrade account → Place order → See in pending orders
- [ ] End-to-end: Place order → Cancel order → Verify status
- [ ] End-to-end: Sell order from holdings table → Order executes → Holdings update

## 📋 Implementation Order

1. **Remove feature flag** ✅ Quick win (2 min)
2. **Update OrderModal** - Core functionality (30 min)
3. **Update Invest page** - Account selection (20 min)
4. **Update pending orders** - Backend + Frontend (30 min)
5. **Add cancel functionality** - Backend + Frontend (30 min)
6. **Polish UI** - Icons, animations, responsive (1 hour)
7. **Testing** - Comprehensive E2E testing (1 hour)

**Total Time Estimate:** 3-4 hours

## 🚀 Quick Start Commands

```bash
# Backend
cd backend
source venv/bin/activate
python api_server.py

# Frontend
cd frontend-app
npm run dev

# Test trade API
curl -X POST http://localhost:8000/api/trade \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{
    "account_id": "YOUR_SNAPTRADE_ACCOUNT_ID",
    "ticker": "AAPL",
    "notional_amount": 100,
    "side": "BUY"
  }'
```

## 📝 Notes

- **Feature Flag**: `SNAPTRADE_TRADE_EXECUTION` can be removed entirely once testing is complete
- **Connection Type**: Users must reconnect accounts with `connectionType=trade` to enable trading
- **Buying Power**: Currently using cached values from database, could add real-time fetch
- **Order Types**: Currently only Market orders implemented, can add Limit/Stop later
- **Mobile UI**: Ensure touch-friendly on mobile (larger tap targets, swipe gestures)

## 🎯 Success Criteria

- ✅ Users can execute trades via any trade-enabled SnapTrade account
- ✅ Account selection is intuitive and aesthetic
- ✅ Buying power is displayed and validated
- ✅ Orders show correct brokerage name in pending orders
- ✅ Orders can be cancelled from portfolio page
- ✅ UI matches platform aesthetic (dark, glassmorphic, gradients)
- ✅ Works on mobile and desktop
- ✅ No errors in console
- ✅ Comprehensive error handling with user-friendly messages

---

**Ready to implement? Start with removing the feature flag wrapper, then work through the order modal updates.**

