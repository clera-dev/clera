import { NextRequest, NextResponse } from 'next/server';

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
        // Wildcard domain match (e.g., *.example.com)
        return domain.endsWith(allowedDomain.substring(1)) || domain === allowedDomain.substring(2);
      }
      // Exact domain match
      return domain === allowedDomain;
    });

    if (!isAllowed) {
      console.warn(`[Image Proxy] Blocked request to non-whitelisted domain: ${domain}`);
      return new NextResponse(`Domain not allowed: ${domain}`, { status: 403 });
    }

    // 3. Fetch the image
    const response = await fetch(imageUrl, {
      headers: {
        // It's good practice to set a custom User-Agent
        'User-Agent': 'Clera-Image-Proxy/1.0',
      },
    });

    if (!response.ok) {
      console.error(`[Image Proxy] Failed to fetch image from ${imageUrl}. Status: ${response.status}`);
      return new NextResponse('Failed to fetch image', { status: response.status });
    }

    // 4. Stream the image response back to the client
    const imageContentType = response.headers.get('Content-Type') || 'application/octet-stream';
    
    // Ensure we only proxy image content types
    if (!imageContentType.startsWith('image/')) {
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

  } catch (error) {
    console.error('[Image Proxy] An unexpected error occurred:', error);
    return new NextResponse('Invalid image URL or proxy error', { status: 500 });
  }
} 