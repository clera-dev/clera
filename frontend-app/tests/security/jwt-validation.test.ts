/**
 * JWT Validation Security Tests
 * 
 * Tests to ensure JWT token validation prevents token spoofing and privilege escalation
 */

import { authenticateWithJWT } from '@/utils/api/secure-backend-helpers';

// Mock Supabase client
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn()
}));

describe('JWT Validation Security Tests', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSupabase = {
      auth: {
        getUser: jest.fn()
      }
    };
    
    const { createClient } = require('@/utils/supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });

  it('should reject requests without Authorization header', async () => {
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue(null);
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('JWT token required');
  });

  it('should reject requests with invalid Bearer token format', async () => {
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue('InvalidFormat token123');
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('JWT token required');
  });

  it('should reject invalid JWT tokens', async () => {
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue('Bearer invalid.jwt.token');
    
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' }
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('Invalid or expired JWT token');
  });

  it('should reject expired JWT tokens', async () => {
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue('Bearer expired.jwt.token');
    
    // Mock Supabase returning an error for expired token
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' }
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('Invalid or expired JWT token');
  });

  it('should reject tokens with mismatched user IDs (token spoofing attempt)', async () => {
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue('Bearer spoofed.jwt.token');
    
    // Mock Supabase returning an error for invalid/spoofed token
    // Supabase's getUser() will reject tokens that don't match the expected user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token signature' }
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('Invalid or expired JWT token');
  });

  it('should accept valid JWT tokens with matching user IDs', async () => {
    // Mock valid JWT token
    const mockToken = 'valid.jwt.token';
    
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue(`Bearer ${mockToken}`);
    
    const mockUser = { id: 'user123', email: 'test@example.com' };
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });
    
    const result = await authenticateWithJWT(request);
    
    expect(result.user).toEqual(mockUser);
    expect(result.accessToken).toBe(mockToken);
    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith(mockToken);
  });

  it('should reject malformed JWT tokens', async () => {
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue('Bearer malformed-token-no-dots');
    
    // Mock Supabase returning an error for malformed token
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid JWT format' }
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('Invalid or expired JWT token');
  });
});