# Middleware Security Model

## Overview

The Clera middleware implements a comprehensive security model that enforces authentication, onboarding verification, and funding verification for all sensitive financial operations. This document outlines the security architecture and recent critical fixes.

## Security Layers

### 1. Authentication Layer
- **Requirement**: Valid Supabase JWT token
- **Enforcement**: All protected routes require authentication
- **Failure Response**: 401 Unauthorized for APIs, redirect to homepage for pages

### 2. Onboarding Verification Layer
- **Requirement**: Completed account onboarding (status: 'submitted' or 'approved')
- **Enforcement**: Financial operations require completed onboarding
- **Failure Response**: 401 Unauthorized for APIs, redirect to /protected for pages

### 3. Funding Verification Layer
- **Requirement**: Account has received funding (minimum $1 transfer)
- **Enforcement**: Trading operations require funded account
- **Failure Response**: 403 Forbidden for APIs, redirect to /protected for pages

## Critical Financial Endpoints

The following endpoints are protected with full security verification:

### Bank Operations
- `/api/broker/connect-bank` - Plaid bank connection
- `/api/broker/connect-bank-manual` - Manual bank connection
- `/api/broker/bank-status` - Bank account status
- `/api/broker/delete-ach-relationship` - Delete bank relationships
- `/api/broker/funding-status` - Funding status

### Transfer Operations
- `/api/broker/transfer` - Money transfers
- `/api/broker/transfer-history` - Transfer history

### Account Operations
- `/api/broker/account-summary` - Account summary
- `/api/broker/account-info` - Account information

### Portfolio Operations
- `/api/portfolio/positions` - Portfolio positions
- `/api/portfolio/history` - Portfolio history
- `/api/portfolio/orders` - Order management

## Security Configuration

### Route Configuration
Each protected route has explicit security requirements defined in `middleware-helpers.ts`:

```typescript
export interface RouteConfig {
  requiresAuth: boolean;        // Authentication required
  requiresOnboarding: boolean;  // Onboarding completion required
  requiresFunding: boolean;     // Account funding required
  requiredRole: string;         // User role required
}
```

### Example Configurations
```typescript
// Bank connection - requires auth and onboarding
"/api/broker/connect-bank": { 
  requiresAuth: true, 
  requiresOnboarding: true, 
  requiresFunding: false, 
  requiredRole: "user" 
}

// Manual bank connection - requires auth only
"/api/broker/connect-bank-manual": { 
  requiresAuth: true, 
  requiresOnboarding: false, 
  requiresFunding: false, 
  requiredRole: "user" 
}

// Money transfer - requires auth and onboarding
"/api/broker/transfer": { 
  requiresAuth: true, 
  requiresOnboarding: true, 
  requiresFunding: false, 
  requiredRole: "user" 
}
```

## Critical Security Fixes

### Issue: Unconditional Bypasses
**Problem**: The middleware contained unconditional bypasses for critical financial endpoints:
- `/api/broker/connect-bank-manual`
- `/api/broker/bank-status`
- `/api/broker/delete-ach-relationship`
- `/api/broker/funding-status`
- `/api/broker/transfer`

**Impact**: These bypasses completely removed authentication, onboarding verification, and funding verification for operations that handle sensitive financial data.

**Fix**: Removed all unconditional bypasses and restored proper security checks.

### Issue: Missing Route Configuration
**Problem**: Some financial endpoints were not included in the route configuration.

**Fix**: Added missing endpoints to the route configuration:
- `/api/broker/delete-ach-relationship`

## Account Closure Security

### Special Handling
Users with pending account closure or closed accounts have restricted access:

1. **Pending Closure**: Blocked from all navigation except:
   - Sign-out functionality
   - Account closure API calls
   - Analytics (PostHog ingest)

2. **Closed Account**: Restricted to /protected page for onboarding restart

## Error Handling

### Database Errors
- **API Routes**: Return 503 Service Unavailable
- **Page Routes**: Redirect to /protected

### Authentication Errors
- **API Routes**: Return 401 Unauthorized
- **Page Routes**: Redirect to homepage

### Onboarding Errors
- **API Routes**: Return 401 Unauthorized with "Onboarding not completed"
- **Page Routes**: Redirect to /protected with intended redirect cookie

### Funding Errors
- **API Routes**: Return 403 Forbidden with "Account funding required"
- **Page Routes**: Redirect to /protected with intended redirect cookie

## Security Best Practices

### 1. Defense in Depth
- Multiple security layers (auth, onboarding, funding)
- Fail-secure error handling
- Comprehensive logging

### 2. Principle of Least Privilege
- Each endpoint has minimum required permissions
- Role-based access control
- Granular security requirements

### 3. Secure by Default
- All routes require authentication unless explicitly public
- Financial operations require additional verification
- No bypasses for security checks

### 4. Audit and Monitoring
- Comprehensive logging of all security decisions
- Clear error messages for debugging
- Security event tracking

## Testing Security

### Manual Testing
1. **Unauthenticated Access**: Verify 401 responses for protected APIs
2. **Incomplete Onboarding**: Verify proper redirects and error messages
3. **Unfunded Account**: Verify funding requirement enforcement
4. **Account Closure**: Verify restricted access during closure process

### Automated Testing
- Unit tests for route configurations
- Integration tests for security flows
- End-to-end tests for complete user journeys

## Compliance Considerations

### Financial Services Regulations
- All financial operations require proper authentication
- Audit trails for all security decisions
- Proper error handling to prevent data leakage

### Data Protection
- No sensitive data in error messages
- Secure session management
- Proper cookie security settings

## Monitoring and Alerting

### Security Events to Monitor
- Authentication failures
- Onboarding verification failures
- Funding verification failures
- Unauthorized access attempts
- Account closure status changes

### Alerting Thresholds
- Multiple failed authentication attempts
- Unusual access patterns
- Security bypass attempts
- Database connection failures

## Incident Response

### Security Breach Response
1. **Immediate**: Block affected endpoints if necessary
2. **Investigation**: Review logs and access patterns
3. **Containment**: Implement additional security measures
4. **Recovery**: Restore normal operations with enhanced monitoring
5. **Post-Incident**: Update security measures and documentation

This security model ensures that Clera maintains the highest standards of security for financial operations while providing a smooth user experience. 