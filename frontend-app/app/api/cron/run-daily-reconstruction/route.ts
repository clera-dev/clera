/**
 * Cron endpoint for daily portfolio reconstruction
 * 
 * Runs after market close (4:30 AM EST / 9:30 AM UTC) to reconstruct
 * yesterday's portfolio values using actual transaction data and price history.
 * 
 * This fills in the historical timeline so charts show accurate data.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 300; // 5 minutes timeout

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 [Cron] Starting daily portfolio reconstruction...');
    
    // Verify this is a cron request (Vercel sets this header)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('⚠️ [Cron] Unauthorized reconstruction attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Trigger reconstruction for all aggregation users
    const backendUrl = process.env.BACKEND_API_URL;
    const apiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl || !apiKey) {
      throw new Error('Backend API configuration missing');
    }
    
    const reconstructionUrl = `${backendUrl}/api/portfolio/reconstruction/trigger-daily`;
    
    console.log(`📡 [Cron] Calling backend: ${reconstructionUrl}`);
    
    const response = await fetch(reconstructionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    console.log('✅ [Cron] Daily reconstruction completed:', result);
    
    return NextResponse.json({
      success: true,
      message: 'Daily portfolio reconstruction triggered',
      result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ [Cron] Daily reconstruction failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

