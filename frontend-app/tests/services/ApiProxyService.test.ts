import { ApiProxyService, ProxyRequest } from '@/utils/services/ApiProxyService';
import { ApiError } from '@/utils/services/errors';

// Mock fetch globally
global.fetch = jest.fn();

describe('ApiProxyService', () => {
  let service: ApiProxyService;
  let mockConfig: any;
  let mockUserAccessToken: string;

  beforeEach(() => {
    service = ApiProxyService.getInstance();
    mockConfig = {
      url: 'https://api.example.com',
      apiKey: 'test-api-key'
    };
    mockUserAccessToken = 'test-jwt-token';
    
    // Reset fetch mock
    (fetch as jest.Mock).mockReset();
  });

  describe('proxy method - response handling', () => {
    it('should handle JSON responses correctly', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn().mockResolvedValue('{"success": true, "data": "test"}')
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/test',
        method: 'GET'
      };

      const result = await service.proxy(mockConfig, mockUserAccessToken, request);

      expect(result.data).toEqual({ success: true, data: 'test' });
      expect(result.status).toBe(200);
    });

    it('should handle 204 No Content responses correctly', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue('')
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/delete',
        method: 'DELETE'
      };

      const result = await service.proxy(mockConfig, mockUserAccessToken, request);

      expect(result.data).toBeNull();
      expect(result.status).toBe(204);
    });

    it('should handle file download responses correctly', async () => {
      const mockPdfData = new ArrayBuffer(8);
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/pdf'],
          ['content-disposition', 'attachment; filename="document.pdf"']
        ]),
        arrayBuffer: jest.fn().mockResolvedValue(mockPdfData)
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/account/123/documents/456/download',
        method: 'GET'
      };

      const result = await service.proxy(mockConfig, mockUserAccessToken, request);

      expect(result.data).toBe(mockPdfData);
      expect(result.status).toBe(200);
      expect(result.headers?.['content-type']).toBe('application/pdf');
      expect(result.headers?.['content-disposition']).toBe('attachment; filename="document.pdf"');
    });

    it('should handle binary responses correctly', async () => {
      const mockImageData = new ArrayBuffer(16);
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/png']]),
        arrayBuffer: jest.fn().mockResolvedValue(mockImageData)
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/image/123',
        method: 'GET'
      };

      const result = await service.proxy(mockConfig, mockUserAccessToken, request);

      expect(result.data).toBe(mockImageData);
      expect(result.status).toBe(200);
      expect(result.headers?.['content-type']).toBe('image/png');
    });

    it('should handle JSON error responses correctly', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn().mockResolvedValue('{"error": "Resource not found"}')
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/not-found',
        method: 'GET'
      };

      await expect(service.proxy(mockConfig, mockUserAccessToken, request))
        .rejects
        .toThrow(ApiError);
    });

    it('should handle non-JSON error responses correctly', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue('Internal Server Error')
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/error',
        method: 'GET'
      };

      await expect(service.proxy(mockConfig, mockUserAccessToken, request))
        .rejects
        .toThrow(ApiError);
    });

    it('should handle JSON parsing errors correctly', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn().mockResolvedValue('invalid json')
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/invalid-json',
        method: 'GET'
      };

      await expect(service.proxy(mockConfig, mockUserAccessToken, request))
        .rejects
        .toThrow(ApiError);
    });

    it('should handle empty JSON responses correctly', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn().mockResolvedValue('')
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/empty',
        method: 'GET'
      };

      const result = await service.proxy(mockConfig, mockUserAccessToken, request);

      expect(result.data).toEqual({});
      expect(result.status).toBe(200);
    });
  });

  describe('header sanitization', () => {
    it('should prevent sensitive header injection', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn().mockResolvedValue('{"success": true}')
      };
      
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const request: ProxyRequest = {
        backendPath: '/api/test',
        method: 'GET',
        additionalHeaders: {
          'X-API-KEY': 'malicious-key',
          'Authorization': 'malicious-auth',
          'X-User-ID': 'malicious-user',
          'Custom-Header': 'safe-value'
        }
      };

      await service.proxy(mockConfig, mockUserAccessToken, request);

      // Verify that the fetch was called with sanitized headers
      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;
      
      expect(headers['X-API-KEY']).not.toBe('malicious-key');
      expect(headers['Authorization']).not.toBe('malicious-auth');
      expect(headers['X-User-ID']).toBeUndefined();
      expect(headers['Custom-Header']).toBe('safe-value');
    });
  });

  describe('query string building', () => {
    it('should build query strings correctly', () => {
      const params = {
        accountId: '123',
        limit: 50,
        status: 'active',
        empty: null,
        undefined: undefined
      };

      const queryString = service.buildQueryString(params);
      expect(queryString).toBe('?accountId=123&limit=50&status=active');
    });

    it('should handle empty params', () => {
      const queryString = service.buildQueryString({});
      expect(queryString).toBe('');
    });

    it('should handle all null/undefined params', () => {
      const params = {
        param1: null,
        param2: undefined
      };

      const queryString = service.buildQueryString(params);
      expect(queryString).toBe('');
    });
  });

  describe('backend path creation', () => {
    it('should create backend paths with query parameters', () => {
      const basePath = '/api/portfolio';
      const params = {
        accountId: '123',
        limit: 50
      };

      const path = service.createBackendPath(basePath, params);
      expect(path).toBe('/api/portfolio?accountId=123&limit=50');
    });

    it('should handle base path without params', () => {
      const basePath = '/api/health';
      const params = {};

      const path = service.createBackendPath(basePath, params);
      expect(path).toBe('/api/health');
    });
  });
}); 