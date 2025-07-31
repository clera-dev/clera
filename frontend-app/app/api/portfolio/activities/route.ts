import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { 
  authenticateAndConfigureBackend, 
  convertErrorToResponse 
} from '@/lib/utils/api-route-helpers';
import { AccountAuthorizationService } from '@/utils/services/AccountAuthorizationService';
import { ApiProxyService } from '@/utils/services/ApiProxyService';
import { ValidationService } from '@/utils/services/ValidationService';
import { ApiError } from '@/utils/services/errors';

/**
 * API route to get portfolio activities.
 * This route follows a clean architecture:
 * 1. Authentication and Configuration
 * 2. Input Validation
 * 3. Authorization
 * 4. Business Logic (Proxying)
 * 5. Response Formatting
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate and Configure
    const { user, backendConfig } = await authenticateAndConfigureBackend();

    // 2. Validate Inputs
    const validationService = ValidationService.getInstance();
    const { isValid, value, error } = validationService.extractQueryParams(request, {
      accountId: { required: true, validate: ValidationService.validators.isNotEmpty },
      limit: { transform: ValidationService.transformers.toInteger, validate: ValidationService.validators.isPositiveInteger }
    });

    if (!isValid && error) {
      return convertErrorToResponse(error, request.nextUrl.pathname);
    }
    const { accountId, limit } = value;

    // 3. Authorize
    await AccountAuthorizationService.getInstance().requireAccountOwnership(user.id, accountId);

    // 4. Execute Proxy Logic
    const proxyService = ApiProxyService.getInstance();
    const backendPath = proxyService.createBackendPath('/api/portfolio/activities', { account_id: accountId, limit });
    
    const { data, status } = await proxyService.proxy(
      backendConfig,
      user.id,
      { backendPath }
    );

    // 5. Format and Return Response
    return NextResponse.json(data, { status });

  } catch (error: any) {
    // Centralized error handling converts ApiError and other errors to a NextResponse
    return convertErrorToResponse(error, request.nextUrl.pathname);
  }
}
