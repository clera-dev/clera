import { NextRequest, NextResponse } from 'next/server';

/**
 * Securely validates if a domain matches a wildcard pattern
 * Prevents SSRF attacks by ensuring only proper subdomains are allowed
 * 
 * @param domain - The domain to validate (e.g., "api.example.com")
 * @param wildcardPattern - The wildcard pattern (e.g., "*.example.com")
 * @returns true if domain is a valid match, false otherwise
 */
const isSecureWildcardMatch = (domain: string, wildcardPattern: string): boolean => {
  if (!wildcardPattern.startsWith('*.')) {
    return false;
  }
  
  const baseDomain = wildcardPattern.substring(2); // Remove "*.", so "*.example.com" -> "example.com"
  
  // Case 1: Exact match with base domain
  if (domain === baseDomain) {
    return true;
  }
  
  // Case 2: Proper subdomain match
  // Ensure domain ends with the base domain
  if (!domain.endsWith(baseDomain)) {
    return false;
  }
  
  // Check that there's a dot separator before the base domain
  const dotIndex = domain.length - baseDomain.length - 1;
  if (dotIndex < 0 || domain.charAt(dotIndex) !== '.') {
    return false;
  }
  
  // Ensure the part before the dot is not empty (prevents "..example.com")
  const subdomainPart = domain.substring(0, dotIndex);
  if (subdomainPart.length === 0) {
    return false;
  }
  
  // Additional security check: ensure the subdomain part doesn't start or end with a dot
  // This prevents domains like ".example.com" or "example.com."
  if (subdomainPart.startsWith('.') || subdomainPart.endsWith('.')) {
    return false;
  }
  
  return true;
};

// Load allowed domains from environment variables for better security and configuration management.
// The env var should be a comma-separated list of domains.
const ALLOWED_DOMAINS_STRING = process.env.IMAGE_PROXY_ALLOWED_DOMAINS || '';
const ALLOWED_DOMAINS = ALLOWED_DOMAINS_STRING.split(',').map(d => d.trim()).filter(Boolean);

// Add default domains for development if the env var is not set.
if (process.env.NODE_ENV === 'development' && ALLOWED_DOMAINS.length === 0) {
  ALLOWED_DOMAINS.push(
    'images.unsplash.com',
    's.yimg.com',
    'staticx-tuner.zacks.com',
    'www.benzinga.com',
    'g.foolcdn.com',
    '*.alphavantage.co',
    '*.zacks.com',
    '*.benzinga.com'
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  try {
    const url = new URL(imageUrl);

    // 1. Protocol Validation
    if (url.protocol !== 'https:') {
      console.warn(`[Image Proxy] Blocked request with non-HTTPS protocol: ${url.protocol}`);
      return new NextResponse('Invalid image protocol. Only HTTPS is allowed.', { status: 400 });
    }

    // 2. Domain Allowlist Validation
    const domain = url.hostname;
    const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => {
      if (allowedDomain.startsWith('*.')) {
        // Use secure wildcard matching to prevent SSRF attacks
        return isSecureWildcardMatch(domain, allowedDomain);
      }
      // Exact domain match
      return domain === allowedDomain;
    });

    if (!isAllowed) {
      console.warn(`[Image Proxy] Blocked request to non-whitelisted domain: ${domain}`);
      return new NextResponse(`Domain not allowed: ${domain}`, { status: 403 });
    }

    // 3. Fetch the image with timeout protection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(imageUrl, {
        headers: {
          // It's good practice to set a custom User-Agent
          'User-Agent': 'Clera-Image-Proxy/1.0',
        },
        signal: controller.signal,
      });

      // Clear the timeout since the request completed
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[Image Proxy] Failed to fetch image from ${imageUrl}. Status: ${response.status}`);
        return new NextResponse('Failed to fetch image', { status: response.status });
      }

      // 4. Stream the image response back to the client
      const imageContentType = response.headers.get('Content-Type') || 'application/octet-stream';
      
      // Ensure we only proxy image content types (case-insensitive check)
      if (!imageContentType.toLowerCase().startsWith('image/')) {
          console.warn(`[Image Proxy] Blocked non-image content type: ${imageContentType} from ${imageUrl}`);
          return new NextResponse('URL does not point to a valid image.', { status: 400 });
      }

      return new NextResponse(response.body, {
        status: 200,
        headers: {
          'Content-Type': imageContentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // Cache for 1 day, revalidate for a week
        },
      });

    } catch (fetchError: any) {
      // Clear the timeout since we're handling the error
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.warn(`[Image Proxy] Request timed out for image: ${imageUrl}`);
        return new NextResponse('Image request timed out. Please try again later.', { status: 504 });
      }
      
      console.error(`[Image Proxy] Failed to fetch image from ${imageUrl}:`, fetchError);
      return new NextResponse('Failed to fetch image', { status: 502 });
    }

  } catch (error) {
    console.error('[Image Proxy] An unexpected error occurred:', error);
    return new NextResponse('Invalid image URL or proxy error', { status: 500 });
  }
} 