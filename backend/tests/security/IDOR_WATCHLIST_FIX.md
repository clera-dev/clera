# IDOR Vulnerability Fix: Watchlist Endpoints

## Summary

Fixed a critical **Insecure Direct Object Reference (IDOR)** vulnerability in the watchlist endpoints that allowed any authenticated service to access or modify any user's watchlist by providing a different `user_id` in the URL path.

## Vulnerability Details

### What Was Vulnerable

**Before Fix (VULNERABLE):**
```python
@app.get("/api/user/{user_id}/watchlist", response_model=WatchlistResponse)
async def get_user_watchlist(
    user_id: str,  # ❌ VULNERABILITY: user_id from URL path
    api_key: str = Depends(verify_api_key)  # ❌ Only validates API key, not user identity
):
    # Any caller with valid API key can access ANY user's watchlist
    symbols = UserWatchlistService.get_user_watchlist(user_id)
    ...
```

**Attack Vector:**
```bash
# Attacker with valid API key could access ANY user's watchlist:
curl -H "X-API-Key: valid_api_key" \
     https://api.askclera.com/api/user/VICTIM_USER_ID/watchlist
```

### Impact

- **Complete authorization bypass** - Access any user's watchlist data
- **Data manipulation** - Add/remove symbols from any user's watchlist
- **Privacy violation** - Expose investment interests and trading strategies
- **Compliance risk** - GDPR/privacy regulation violations

## Fix Implementation

### Backend Changes

**After Fix (SECURE):**

1. **GET /api/user/watchlist**
   - Removed `user_id` from URL path parameter
   - Added `user_id: str = Depends(get_authenticated_user_id)` to derive user ID from JWT token
   - Added security documentation

```python
@app.get("/api/user/watchlist", response_model=WatchlistResponse)
async def get_user_watchlist(
    user_id: str = Depends(get_authenticated_user_id),  # ✅ User ID from JWT token
    api_key: str = Depends(verify_api_key)
):
    """
    Get user's watchlist (works for both aggregation and brokerage modes).
    Stores watchlist in Supabase, independent of Alpaca accounts.
    
    SECURITY: user_id is derived from JWT token to prevent IDOR attacks.
    """
    ...
```

2. **POST /api/user/watchlist/add**
   - Removed `user_id` from URL path parameter
   - Added `user_id: str = Depends(get_authenticated_user_id)` 
   - Request body parameter moved before dependency injections

3. **DELETE /api/user/watchlist/remove**
   - Removed `user_id` from URL path parameter
   - Added `user_id: str = Depends(get_authenticated_user_id)`
   - Request body parameter moved before dependency injections

### Frontend Changes

Updated all three API routes to use the new secure endpoints:

1. **frontend-app/app/api/user/watchlist/route.ts**
   - Changed from: `${backendUrl}/api/user/${user.id}/watchlist`
   - Changed to: `${backendUrl}/api/user/watchlist`
   - Added JWT token to Authorization header: `createBackendHeaders(config, userContext.accessToken)`

2. **frontend-app/app/api/user/watchlist/add/route.ts**
   - Changed from: `${backendUrl}/api/user/${userContext.userId}/watchlist/add`
   - Changed to: `${backendUrl}/api/user/watchlist/add`
   - Added JWT token to Authorization header

3. **frontend-app/app/api/user/watchlist/remove/route.ts**
   - Changed from: `${backendUrl}/api/user/${userContext.userId}/watchlist/remove`
   - Changed to: `${backendUrl}/api/user/watchlist/remove`
   - Added JWT token to Authorization header

## Security Architecture

### Authentication Flow

```
Frontend Client
    ↓ (JWT token in Authorization header)
Frontend API Route
    ↓ (JWT token forwarded to backend)
Backend Endpoint
    ↓ (Depends(get_authenticated_user_id))
JWT Validation
    ↓ (Extract user_id from validated JWT claims)
User Identity Established
    ↓
Access user's own data only
```

### Key Security Principles

1. **Never Trust Client Input for Identity**
   - User ID is NEVER accepted from URL paths, query parameters, or request bodies
   - User ID is ONLY extracted from cryptographically signed JWT tokens

2. **Defense in Depth**
   - API key validates service-level access
   - JWT token validates user-level access
   - Both must be valid for request to succeed

3. **Cryptographic Verification**
   - JWT tokens are cryptographically signed
   - Tampering with claims (like user_id) invalidates the signature
   - `get_authenticated_user_id()` verifies signature before extracting claims

## Files Changed

### Backend
- `/backend/api_server.py` (lines 4119-4214)
  - Updated 3 watchlist endpoints

### Frontend
- `/frontend-app/app/api/user/watchlist/route.ts`
- `/frontend-app/app/api/user/watchlist/add/route.ts`
- `/frontend-app/app/api/user/watchlist/remove/route.ts`

### Documentation
- `/backend/tests/security/IDOR_WATCHLIST_FIX.md` (this file)

## Verification

### Manual Testing

1. **Positive Test** - Valid user can access their own watchlist:
```bash
# Get valid JWT token for user A
curl -H "X-API-Key: ${API_KEY}" \
     -H "Authorization: Bearer ${USER_A_JWT}" \
     https://api.askclera.com/api/user/watchlist

# ✅ Should return user A's watchlist
```

2. **Negative Test** - User cannot access another user's watchlist:
```bash
# Try to access user B's data with user A's token (impossible now - no user_id in URL)
curl -H "X-API-Key: ${API_KEY}" \
     -H "Authorization: Bearer ${USER_A_JWT}" \
     https://api.askclera.com/api/user/watchlist

# ✅ Should return user A's watchlist (from JWT)
# ❌ Cannot specify different user_id in URL anymore
```

3. **Edge Case** - No JWT token provided:
```bash
curl -H "X-API-Key: ${API_KEY}" \
     https://api.askclera.com/api/user/watchlist

# ✅ Should return 401 Unauthorized
```

### Automated Testing

No existing tests were found that needed updating. Future tests should verify:

1. Users can only access their own watchlist data
2. JWT token validation is enforced
3. Invalid/expired tokens are rejected
4. Missing Authorization header returns 401

## Related Security Fixes

This fix follows the same pattern used in other endpoints:

- `/api/portfolio/aggregated` - Uses `Depends(get_authenticated_user_id)`
- `/api/portfolio/value` - Uses `Depends(get_authenticated_user_id)`
- `/api/user/preferences` - Uses `Depends(get_authenticated_user_id)`
- `/api/trade` - Uses `Depends(get_authenticated_user_id)`

All endpoints now consistently derive user identity from JWT tokens, not from client-supplied parameters.

## Date

- **Fixed:** December 10, 2025
- **Severity:** HIGH
- **CVSS Score:** 8.1 (High)
  - Attack Vector: Network
  - Attack Complexity: Low
  - Privileges Required: Low (valid API key)
  - User Interaction: None
  - Impact: High (Confidentiality and Integrity)

## References

- OWASP Top 10 2021: A01:2021 – Broken Access Control
- CWE-639: Authorization Bypass Through User-Controlled Key
- `/backend/tests/security/README_SECURITY_FIX.md` - Previous authentication fix
- `/backend/utils/authentication.py` - `get_authenticated_user_id()` implementation
