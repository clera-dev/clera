import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { 
  authenticateAndConfigureBackend, 
  handleApiError 
} from '@/lib/utils/api-route-helpers';
import { AccountAuthorizationService } from '@/utils/services/AccountAuthorizationService';
import { ApiProxyService } from '@/utils/services/ApiProxyService';
import { ValidationService } from '@/utils/services/ValidationService';

/**
 * Ensures this route is always treated as dynamic, preventing Next.js
 * from throwing errors about `params` usage.
 */
export const dynamic = 'force-dynamic';

/**
 * API route to get portfolio activities.
 * This route is a proxy to the backend service with proper separation of concerns.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user and configure backend
    const { user, backendConfig } = await authenticateAndConfigureBackend();

    // 2. Validate and extract query parameters
    const validationService = ValidationService.getInstance();
    const paramValidation = validationService.extractQueryParams(request, {
      accountId: { 
        required: true,
        validate: ValidationService.validators.isNotEmpty 
      },
      limit: { 
        transform: ValidationService.transformers.toInteger,
        validate: ValidationService.validators.isPositiveInteger 
      }
    });

    if (!paramValidation.isValid && paramValidation.error) {
      return paramValidation.error;
    }

    const { accountId, limit } = paramValidation.value;

    // 3. Verify account ownership
    const authService = AccountAuthorizationService.getInstance();
    await authService.requireAccountOwnership(user.id, accountId);

    // 4. Proxy the request
    const proxyService = ApiProxyService.getInstance();
    const backendPath = proxyService.createBackendPath('/api/portfolio/activities', {
      accountId,
      limit: limit?.toString()
    });

    const result = await proxyService.proxyRequest(
      backendConfig,
      user.id,
      { backendPath }
    );

    return result;

  } catch (error: any) {
    return handleApiError(error, request.nextUrl.pathname);
  }
} 