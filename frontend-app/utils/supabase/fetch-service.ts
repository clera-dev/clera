/**
 * Fetch service abstraction for Supabase client configuration.
 * Provides a clean separation of concerns and enables better testability.
 */

export interface FetchService {
  fetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response>;
}

/**
 * Default fetch service implementation that disables caching.
 * Used by Supabase client for consistent no-cache behavior.
 */
export class NoStoreFetchService implements FetchService {
  async fetch(url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
    return fetch(url, { 
      ...options, 
      cache: 'no-store' 
    });
  }
}

/**
 * Factory function to create fetch service instances.
 * Enables dependency injection and easier testing.
 */
export function createFetchService(): FetchService {
  return new NoStoreFetchService();
}

/**
 * Creates a fetch function that can be injected into Supabase client configuration.
 * This maintains the expected function signature while allowing for proper abstraction.
 */
export function createSupabaseFetch(fetchService: FetchService = createFetchService()) {
  return (url: any, options = {}) => fetchService.fetch(url, options);
} 