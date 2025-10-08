import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSecret } from '@/utils/api/route-middleware';

/**
 * Admin endpoint to manually refresh both trending and watchlist news caches
 * 
 * This is useful for:
 * - Local development (Vercel cron jobs only work in production)
 * - Emergency cache refreshes
 * - Testing the news update pipeline
 * 
 * SECURITY FIX: Admin secret moved from URL query param to X-Admin-Secret header
 * to prevent credential leaks in logs/history
 * 
 * Usage: GET /api/admin/refresh-news
 * Headers: X-Admin-Secret: YOUR_ADMIN_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY FIX: Check admin authorization via header (not URL)
    // This prevents credential leakage through browser history, referrer headers, and logs
    const providedSecret = request.headers.get('x-admin-secret');
    
    if (!validateAdminSecret(providedSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ 
        error: 'CRON_SECRET not configured' 
      }, { status: 500 });
    }

    // SECURITY FIX: Use current request origin instead of potentially misconfigured env var
    // This ensures the refresh calls are made to the same origin making the request
    const requestUrl = new URL(request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    
    const results = {
      trending: { success: false, message: '', error: null as any },
      watchlist: { success: false, message: '', error: null as any }
    };

    // Trigger trending news update
    try {
      const trendingResponse = await fetch(`${baseUrl}/api/cron/update-trending-news`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json'
        }
      });

      const trendingData = await trendingResponse.json();
      
      if (trendingResponse.ok) {
        results.trending.success = true;
        results.trending.message = trendingData.message || 'Trending news updated';
      } else {
        results.trending.error = trendingData.error || `HTTP ${trendingResponse.status}`;
      }
    } catch (error: any) {
      results.trending.error = error.message;
    }

    // Trigger watchlist news update
    try {
      const watchlistResponse = await fetch(`${baseUrl}/api/cron/update-watchlist-news`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json'
        }
      });

      const watchlistData = await watchlistResponse.json();
      
      if (watchlistResponse.ok) {
        results.watchlist.success = true;
        results.watchlist.message = watchlistData.message || 'Watchlist news updated';
      } else {
        results.watchlist.error = watchlistData.error || `HTTP ${watchlistResponse.status}`;
      }
    } catch (error: any) {
      results.watchlist.error = error.message;
    }

    // Determine overall success
    const overallSuccess = results.trending.success && results.watchlist.success;

    return NextResponse.json({
      success: overallSuccess,
      message: overallSuccess 
        ? 'Both trending and watchlist news updated successfully' 
        : 'One or more news updates failed',
      results,
      timestamp: new Date().toISOString()
    }, { status: overallSuccess ? 200 : 207 }); // 207 Multi-Status for partial success

  } catch (error: any) {
    console.error('Admin refresh-news error:', error);
    return NextResponse.json({ 
      error: error.message || 'Unknown error',
      success: false 
    }, { status: 500 });
  }
}

