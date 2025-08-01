import { NextRequest, NextResponse } from 'next/server';
import { isSecureWildcardMatch } from '@/utils/security';

/**
 * Checks if a hostname resolves to a private/internal IP address
 * Prevents SSRF attacks by blocking access to internal network ranges
 * 
 * @param hostname - The hostname to check
 * @returns true if the hostname is a private IP, false otherwise
 */
const isPrivateIP = (hostname: string): boolean => {
  // Check for common private IP patterns
  const privateIPPatterns = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^127\./,                   // 127.0.0.0/8 (localhost)
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
    /^0\./,                     // 0.0.0.0/8
    /^::1$/,                    // IPv6 localhost
    /^fe80:/,                   // IPv6 link-local
    /^fc00:/,                   // IPv6 unique local
    /^fd00:/,                   // IPv6 unique local
  ];

  return privateIPPatterns.some(pattern => pattern.test(hostname));
};

/**
 * Validates a URL against security requirements
 * Prevents SSRF attacks by enforcing strict validation
 * 
 * @param url - The URL to validate
 * @param originalUrl - The original URL for logging context
 * @returns true if the URL is safe, false otherwise
 */
const validateUrl = (url: URL, originalUrl: string): { isValid: boolean; error?: string } => {
  // Validate protocol
  if (url.protocol !== 'https:') {
    console.warn(`[Image Proxy] Blocked request with non-HTTPS protocol: ${url.protocol} from ${originalUrl}`);
    return { isValid: false, error: 'Invalid image protocol. Only HTTPS is allowed.' };
  }

  // Validate domain against allowlist
  const domain = url.hostname.toLowerCase();
  const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => {
    if (allowedDomain.startsWith('*.')) {
      return isSecureWildcardMatch(domain, allowedDomain);
    }
    return domain === allowedDomain;
  });

  if (!isAllowed) {
    console.warn(`[Image Proxy] Blocked request to non-whitelisted domain: ${domain} from ${originalUrl}`);
    return { isValid: false, error: `Domain not allowed: ${domain}` };
  }

  // Block private IP ranges
  if (isPrivateIP(url.hostname)) {
    console.warn(`[Image Proxy] Blocked request to private IP: ${url.hostname} from ${originalUrl}`);
    return { isValid: false, error: 'Access to private IP ranges not allowed' };
  }

  return { isValid: true };
};

// Load allowed domains from environment variables for better security and configuration management.
// The env var should be a comma-separated list of domains.
const ALLOWED_DOMAINS_STRING = process.env.IMAGE_PROXY_ALLOWED_DOMAINS || '';
const ALLOWED_DOMAINS = ALLOWED_DOMAINS_STRING.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

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
    '*.benzinga.com',
    // Financial news domains
    'ml.globenewswire.com',
    's3.cointelegraph.com',
    '*.globenewswire.com',
    '*.cointelegraph.com',
    '*.reuters.com',
    '*.bloomberg.com',
    '*.marketwatch.com',
    '*.cnbc.com',
    '*.yahoo.com',
    '*.investing.com',
    '*.seekingalpha.com',
    '*.fool.com',
    '*.motleyfool.com'
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

    // Initial URL validation
    const initialValidation = validateUrl(url, imageUrl);
    if (!initialValidation.isValid) {
      return new NextResponse(initialValidation.error!, { status: 400 });
    }

    // 3. Fetch the image with redirect validation and timeout protection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    // Helper function to clean up resources
    const cleanup = () => {
      clearTimeout(timeoutId);
      controller.abort();
    };

    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Clera-Image-Proxy/1.0',
        },
        signal: controller.signal,
        // SECURITY: Disable automatic redirect following to prevent SSRF attacks
        redirect: 'manual',
      });

      // SECURITY: Handle redirects manually with multi-hop protection
      let finalResponse = response;
      let finalUrl = imageUrl;
      let redirectCount = 0;
      const MAX_REDIRECTS = 3; // Prevent infinite redirect loops
      let currentResponse = response;

      while (currentResponse.status >= 300 && currentResponse.status < 400 && redirectCount < MAX_REDIRECTS) {
        const location = currentResponse.headers.get('Location');
        if (!location) {
          console.warn(`[Image Proxy] Redirect response without Location header from ${finalUrl}`);
          cleanup();
          return new NextResponse('Invalid redirect response', { status: 400 });
        }

        try {
          const redirectUrl = new URL(location, finalUrl); // Resolve relative URLs
          redirectCount++;
          
          // SECURITY: Validate each redirect target with the same strict rules
          const redirectValidation = validateUrl(redirectUrl, finalUrl);
          if (!redirectValidation.isValid) {
            cleanup();
            return new NextResponse(redirectValidation.error!, { status: 403 });
          }

          // SECURITY: Follow the validated redirect manually with redirect: 'manual'
          const redirectResponse = await fetch(redirectUrl.toString(), {
            headers: {
              'User-Agent': 'Clera-Image-Proxy/1.0',
            },
            signal: controller.signal,
            // CRITICAL FIX: Prevent automatic redirect following to stop SSRF attacks
            redirect: 'manual',
          });

          if (!redirectResponse.ok) {
            console.error(`[Image Proxy] Failed to fetch redirected image from ${redirectUrl}. Status: ${redirectResponse.status}`);
            cleanup();
            return new NextResponse('Failed to fetch redirected image', { status: redirectResponse.status });
          }

          // Update for next iteration
          finalResponse = redirectResponse;
          finalUrl = redirectUrl.toString();
          
                     // Continue loop if this response is also a redirect
           if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
             currentResponse = redirectResponse;
             continue;
           }
          
          // Break if we got a successful response
          break;
          
        } catch (redirectError) {
          console.error(`[Image Proxy] Error processing redirect from ${finalUrl}:`, redirectError);
          cleanup();
          return new NextResponse('Invalid redirect URL', { status: 400 });
        }
      }

      // SECURITY: Check if we exceeded maximum redirects
      if (redirectCount >= MAX_REDIRECTS) {
        console.warn(`[Image Proxy] Too many redirects (${redirectCount}) for ${imageUrl}`);
        cleanup();
        return new NextResponse('Too many redirects', { status: 400 });
      }

      // Clear the timeout since the request completed
      clearTimeout(timeoutId);

      if (!finalResponse.ok) {
        console.error(`[Image Proxy] Failed to fetch image from ${finalUrl}. Status: ${finalResponse.status}`);
        return new NextResponse('Failed to fetch image', { status: finalResponse.status });
      }

      // 4. Stream the image response back to the client
      const imageContentType = finalResponse.headers.get('Content-Type') || 'application/octet-stream';
      
      // Ensure we only proxy image content types (case-insensitive check)
      if (!imageContentType.toLowerCase().startsWith('image/')) {
          console.warn(`[Image Proxy] Blocked non-image content type: ${imageContentType} from ${imageUrl}`);
          return new NextResponse('URL does not point to a valid image.', { status: 400 });
      }

      return new NextResponse(finalResponse.body, {
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