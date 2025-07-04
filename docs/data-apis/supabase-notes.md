# Supabase Integration Documentation

## Overview

This document outlines Clera's integration with Supabase for authentication and database management. It serves as a guide for developers to understand how to access data, create new tables, and follow established patterns for database interactions.

## Authentication

### User Authentication Flow

1. **Sign Up**: Users register via `signUpAction` in `app/actions.ts`
2. **Sign In**: Users log in via `signInAction` in `app/actions.ts`
3. **Password Reset**: Handled via `forgotPasswordAction` and `resetPasswordAction`
4. **Session Management**: Managed through Supabase cookies and middleware

### Auth User Structure

```typescript
// User object structure from supabase.auth.getUser()
interface User {
  id: string;        // UUID - Primary identifier for the user
  email: string;     // User's email address
  app_metadata: {    // Metadata set by the application
    provider: string;
    providers: string[];
  };
  user_metadata: {   // Custom user data
    // Any custom fields
  };
  aud: string;
  created_at: string;
}
```

### Accessing the Current User

**Server Components**:
```typescript
// In server components or server actions
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

// user.id can be used for queries
```

**Client Components**:
```typescript
// For client components, use client-side wrapper or server actions
// Don't import server-side auth directly in client components
```

## Database Structure

### Tables

1. **auth.users** (managed by Supabase)
   - Contains all authenticated users
   - Created automatically by Supabase Auth

2. **public.user_onboarding**
   - Stores user onboarding data for Alpaca brokerage accounts
   - Schema:
     ```sql
     CREATE TABLE public.user_onboarding (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
         status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'submitted', 'approved', 'rejected')),
         onboarding_data JSONB NOT NULL DEFAULT '{}'::jsonb,
         created_at TIMESTAMPTZ NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL,
         alpaca_account_id TEXT,
         alpaca_account_number TEXT,
         alpaca_account_status TEXT,
         CONSTRAINT user_onboarding_user_id_key UNIQUE (user_id)
     );
     ```

### Relationships

- `user_onboarding.user_id` → `auth.users.id` (Foreign Key)
  - This ensures every onboarding record is linked to a valid user
  - `ON DELETE CASCADE` ensures user data is cleaned up if a user is deleted

## Security Model

### Row Level Security (RLS)

All tables should have Row Level Security enabled to ensure users can only access their own data.

```sql
-- Enable RLS on a table
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view only their own data
CREATE POLICY "Users can view their own data" 
    ON public.table_name 
    FOR SELECT 
    USING (auth.uid() = user_id);
```

### Standard RLS Policies

For user-specific tables, implement these standard policies:

1. **SELECT Policy**: Users can only view their own data
2. **INSERT Policy**: Users can only insert their own data
3. **UPDATE Policy**: Users can only update their own data

```sql
-- Example policies for a new table
CREATE POLICY "Users can view their own data" 
    ON public.table_name 
    FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data" 
    ON public.table_name 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data" 
    ON public.table_name 
    FOR UPDATE 
    USING (auth.uid() = user_id);
```

### Permissions

Grant appropriate permissions to the `authenticated` role:

```sql
-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.table_name TO authenticated;
```

## Data Access Patterns

### Server-Side Data Access

For server components and server actions, use the server-side Supabase client:

```typescript
// In server components or server actions
import { createClient } from "@/utils/supabase/server";

export async function serverAction() {
  const supabase = await createClient();
  
  // Query the database
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .eq('user_id', userId);
    
  // Handle results
}
```

### Client-Side Data Access

For client components, create server actions and call them from client components:

```typescript
// In app/actions.ts
export async function getDataAction(userId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .eq('user_id', userId);
    
  // Return results
  return { data, error };
}

// In a client utility file (with "use client" directive)
import { getDataAction } from "@/app/actions";

export async function getData(userId: string) {
  return getDataAction(userId);
}

// In a client component
import { getData } from "@/utils/client-utils";

function ClientComponent({ userId }) {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      const result = await getData(userId);
      setData(result.data);
    }
    fetchData();
  }, [userId]);
  
  // Render with data
}
```

## Error Handling

### Table Existence Checks

When querying tables that might not exist yet (e.g., during development or first use), check for table existence:

```typescript
// Check if table exists before querying
const { error: schemaError } = await supabase
  .from('table_name')
  .select('*')
  .limit(0);

if (schemaError && schemaError.code === '42P01') { // PostgreSQL error for 'relation does not exist'
  // Handle case where table doesn't exist
  return { data: undefined };
}

// Proceed with regular query if table exists
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('user_id', userId);
```

### Common Error Codes

- `PGRST116`: Record not found (when using `.single()`)
- `42P01`: Relation (table) does not exist
- `23505`: Unique constraint violation

## Creating New Tables

### Step 1: Define Table Schema

```sql
CREATE TABLE IF NOT EXISTS public.new_table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    -- Add additional columns as needed
    
    -- If each user should have only one record
    CONSTRAINT new_table_name_user_id_key UNIQUE (user_id)
);

-- Add comments for documentation
COMMENT ON TABLE public.new_table_name IS 'Description of table purpose';
```

### Step 2: Enable RLS and Create Policies

```sql
-- Enable Row Level Security
ALTER TABLE public.new_table_name ENABLE ROW LEVEL SECURITY;

-- Create standard policies
CREATE POLICY "Users can view their own data" 
    ON public.new_table_name 
    FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data" 
    ON public.new_table_name 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data" 
    ON public.new_table_name 
    FOR UPDATE 
    USING (auth.uid() = user_id);
```

### Step 3: Grant Permissions

```sql
-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.new_table_name TO authenticated;
```

### Step 4: Create Server Actions

In `app/actions.ts`, add functions for CRUD operations:

```typescript
export async function createNewTableRecordAction(userId: string, data: any) {
  try {
    const supabase = await createClient();
    
    const { data: result, error } = await supabase
      .from('new_table_name')
      .insert({
        user_id: userId,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) throw error;
    
    return { data: result };
  } catch (error) {
    console.error('Error creating record:', error);
    return { 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
```

### Step 5: Create Client Utilities (if needed)

```typescript
// In utils/api/new-table-client.ts
"use client";

import { createNewTableRecordAction } from "@/app/actions";

export async function createNewTableRecord(userId: string, data: any) {
  return createNewTableRecordAction(userId, data);
}
```

## Best Practices

1. **Always Use RLS**: Enable Row Level Security on all tables to ensure data isolation
2. **Foreign Keys**: Link user data tables to `auth.users` with a foreign key
3. **Server vs. Client**: Keep Supabase database interactions in server components or server actions
4. **Error Handling**: Implement robust error handling, especially for tables that might not exist yet
5. **Timestamps**: Include `created_at` and `updated_at` fields in all tables
6. **JSONB for Complex Data**: Use JSONB columns for storing complex nested data structures
7. **Unique Constraints**: Add unique constraints to prevent duplicate records where appropriate
8. **Documentation**: Add SQL comments to document table and column purposes
9. **Check Constraints**: Use check constraints to limit values for enumerated fields

## Testing Database Changes

After creating new tables or modifying existing ones:

1. Test with direct SQL queries in the Supabase SQL Editor
2. Test through server actions with auth context
3. Verify RLS policies by attempting cross-user access
4. Check error handling for edge cases

## Debugging Tips

1. View real-time database activity in the Supabase Dashboard
2. Use the Supabase Table Editor to directly manipulate data during development
3. Check the Network tab in browser dev tools to see API requests
4. Enable Supabase query logging for deeper debugging

## Environment Variables

Supabase connection requires these environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
