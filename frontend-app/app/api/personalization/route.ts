import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { 
  PersonalizationData,
  PersonalizationFormData
} from '@/lib/types/personalization';
import {
  validatePersonalizationData
} from '@/utils/services/personalization-data';

/**
 * Server-only database formatting functions.
 * These handle the conversion between frontend (camelCase) and database (snake_case) formats.
 * Keeping these server-side maintains proper architectural boundaries.
 */
function formatPersonalizationForDatabase(data: PersonalizationData): Record<string, any> {
  return {
    first_name: data.firstName.trim(),
    investment_goals: data.investmentGoals,
    risk_tolerance: data.riskTolerance,
    investment_timeline: data.investmentTimeline,
    experience_level: data.experienceLevel,
    monthly_investment_goal: data.monthlyInvestmentGoal,
    market_interests: data.marketInterests,
  };
}

function formatPersonalizationFromDatabase(record: any): PersonalizationData {
  return {
    firstName: record.first_name,
    investmentGoals: record.investment_goals || [],
    riskTolerance: record.risk_tolerance,
    investmentTimeline: record.investment_timeline,
    experienceLevel: record.experience_level,
    monthlyInvestmentGoal: record.monthly_investment_goal,
    marketInterests: record.market_interests || [],
  };
}

/**
 * GET /api/personalization
 * Retrieves the user's personalization data
 */
export async function GET(request: NextRequest) {
  try {
    // Verify user authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Retrieve personalization data from Supabase
    const { data: personalizationData, error } = await supabase
      .from('user_personalization')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // If no data exists, return empty/initial data (not an error)
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: true,
          data: null,
          message: 'No personalization data found'
        });
      }
      
      console.error('Error fetching personalization data:', error);
      return NextResponse.json(
        { error: 'Failed to fetch personalization data' },
        { status: 500 }
      );
    }

    // Convert database format to application format
    const formattedData = formatPersonalizationFromDatabase(personalizationData);

    return NextResponse.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error('Error in GET /api/personalization:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/personalization
 * Creates new personalization data for the user
 */
export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const requestData: PersonalizationFormData = await request.json();

    // Validate the personalization data
    const validation = validatePersonalizationData(requestData);
    if (!validation.isValid) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.errors
        },
        { status: 400 }
      );
    }

    // Convert to database format
    const dbData = formatPersonalizationForDatabase(requestData as PersonalizationData);
    
    // Insert into Supabase
    const { data: insertedData, error } = await supabase
      .from('user_personalization')
      .insert({
        user_id: user.id,
        ...dbData
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting personalization data:', error);
      
      // Handle unique constraint violation (user already has personalization data)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Personalization data already exists for this user. Use PUT to update.' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to save personalization data' },
        { status: 500 }
      );
    }

    // Convert back to application format for response
    const formattedData = formatPersonalizationFromDatabase(insertedData);

    return NextResponse.json({
      success: true,
      data: formattedData,
      message: 'Personalization data created successfully'
    });

  } catch (error) {
    console.error('Error in POST /api/personalization:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/personalization
 * Updates existing personalization data for the user
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify user authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const requestData: PersonalizationFormData = await request.json();

    // Validate the personalization data
    const validation = validatePersonalizationData(requestData);
    if (!validation.isValid) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.errors
        },
        { status: 400 }
      );
    }

    // Convert to database format
    const dbData = formatPersonalizationForDatabase(requestData as PersonalizationData);
    
    // Update in Supabase
    const { data: updatedData, error } = await supabase
      .from('user_personalization')
      .update({
        ...dbData,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating personalization data:', error);
      
      // Handle case where no data exists to update
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'No personalization data found to update. Use POST to create.' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to update personalization data' },
        { status: 500 }
      );
    }

    // Convert back to application format for response
    const formattedData = formatPersonalizationFromDatabase(updatedData);

    return NextResponse.json({
      success: true,
      data: formattedData,
      message: 'Personalization data updated successfully'
    });

  } catch (error) {
    console.error('Error in PUT /api/personalization:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
