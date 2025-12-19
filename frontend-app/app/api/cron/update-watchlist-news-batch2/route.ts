import { NextResponse } from 'next/server';
import { processBatch, BATCH_2_SECTORS } from '@/lib/services/watchlist-news-service';

/**
 * Watchlist News Batch 2 Cron Job
 * 
 * Processes the second batch of sectors.
 * Runs 5 minutes after batch 1 to respect Polygon.io's rate limits.
 * 
 * @schedule "5 12 * * *" (12:05 UTC daily) via vercel.json
 */
export async function GET(request: Request) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expectedHeader) {
      console.error('[Watchlist Batch 2] Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const polygonApiKey = process.env.POLYGON_API_KEY;
  if (!polygonApiKey) {
    console.error('[Watchlist Batch 2] Missing POLYGON_API_KEY');
    return NextResponse.json({ error: 'Polygon API key not configured' }, { status: 500 });
  }

  const result = await processBatch(2, BATCH_2_SECTORS, polygonApiKey);

  if (!result.success) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({
    ...result,
    message: `Watchlist news batch 2 updated: ${result.articles_count} articles for ${result.sectors_processed.length} sectors`
  });
}

