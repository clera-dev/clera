import { NextResponse } from 'next/server';
import { processBatch, BATCH_3_SECTORS } from '@/lib/services/watchlist-news-service';

/**
 * Watchlist News Batch 3 Cron Job
 * 
 * Processes the third batch of sectors (remaining 3).
 * Runs 10 minutes after batch 1 to respect Polygon.io's rate limits.
 * 
 * @schedule "10 12 * * *" (12:10 UTC daily) via vercel.json
 */
export async function GET(request: Request) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expectedHeader) {
      console.error('[Watchlist Batch 3] Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const polygonApiKey = process.env.POLYGON_API_KEY;
  if (!polygonApiKey) {
    console.error('[Watchlist Batch 3] Missing POLYGON_API_KEY');
    return NextResponse.json({ error: 'Polygon API key not configured' }, { status: 500 });
  }

  const result = await processBatch(3, BATCH_3_SECTORS, polygonApiKey);

  if (!result.success) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({
    ...result,
    message: `Watchlist news batch 3 updated: ${result.articles_count} articles for ${result.sectors_processed.length} sectors`
  });
}

