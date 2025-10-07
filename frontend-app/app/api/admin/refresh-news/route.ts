import { NextRequest, NextResponse } from 'next/server';

/**
 * Admin endpoint to manually refresh both trending and watchlist news caches
 * 
 * This is useful for:
 * - Local development (Vercel cron jobs only work in production)
 * - Emergency cache refreshes
 * - Testing the news update pipeline
 * 
 * Usage: GET /api/admin/refresh-news?secret=YOUR_ADMIN_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin authorization
    const { searchParams } = new URL(request.url);
    const providedSecret = searchParams.get('secret');
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret || providedSecret !== adminSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ 
        error: 'CRON_SECRET not configured' 
      }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
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

