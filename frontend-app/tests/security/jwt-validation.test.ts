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
  let originalBtoa: any;
  let originalAtob: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock btoa and atob functions for Node.js environment
    originalBtoa = global.btoa;
    originalAtob = global.atob;
    global.btoa = jest.fn().mockImplementation((str) => Buffer.from(str).toString('base64'));
    global.atob = jest.fn().mockImplementation((str) => Buffer.from(str, 'base64').toString());
    
    mockSupabase = {
      auth: {
        getUser: jest.fn()
      }
    };
    
    const { createClient } = require('@/utils/supabase/server');
    createClient.mockReturnValue(mockSupabase);
  });
  
  afterEach(() => {
    // Restore original functions
    global.btoa = originalBtoa;
    global.atob = originalAtob;
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
    // Create a mock expired JWT token
    const expiredPayload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
    };
    const mockExpiredToken = `header.${btoa(JSON.stringify(expiredPayload))}.signature`;
    
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue(`Bearer ${mockExpiredToken}`);
    
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'user123', email: 'test@example.com' }
      },
      error: null
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('JWT token has expired');
  });

  it('should reject tokens with mismatched user IDs (token spoofing attempt)', async () => {
    // Create a mock JWT token for user123
    const tokenPayload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) + 3600 // Valid for 1 hour
    };
    const mockToken = `header.${btoa(JSON.stringify(tokenPayload))}.signature`;
    
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue(`Bearer ${mockToken}`);
    
    // Mock Supabase returning a different user (user456) than what's in the token (user123)
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'user456', email: 'different@example.com' }
      },
      error: null
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('Token user ID mismatch - potential token spoofing attempt');
  });

  it('should accept valid JWT tokens with matching user IDs', async () => {
    // Create a valid mock JWT token
    const validPayload = {
      sub: 'user123',
      exp: Math.floor(Date.now() / 1000) + 3600 // Valid for 1 hour
    };
    const mockToken = `header.${btoa(JSON.stringify(validPayload))}.signature`;
    
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
    
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'user123', email: 'test@example.com' }
      },
      error: null
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('Invalid JWT token format');
  });

  it('should reject tokens with invalid base64 payload', async () => {
    const request = {
      headers: new Map()
    } as any;
    request.headers.get = jest.fn().mockReturnValue('Bearer header.invalid-base64.signature');
    
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { 
        user: { id: 'user123', email: 'test@example.com' }
      },
      error: null
    });
    
    await expect(authenticateWithJWT(request)).rejects.toThrow('Invalid JWT token format');
  });
});