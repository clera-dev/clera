-- Create profiles table to store user profile information
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add table comment
COMMENT ON TABLE public.profiles IS 'Stores user profile information';

-- Set up RLS policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- View policy
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Insert policy
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Update policy
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger for profiles table
CREATE TRIGGER handle_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create trigger function to copy data from onboarding to profiles
CREATE OR REPLACE FUNCTION sync_profile_from_onboarding()
RETURNS TRIGGER AS $$
DECLARE
  profile_exists INTEGER;
  first_name_val TEXT;
  last_name_val TEXT;
  user_email TEXT;
BEGIN
  -- Extract first_name and last_name from onboarding_data JSONB
  first_name_val := NEW.onboarding_data->>'firstName';
  last_name_val := NEW.onboarding_data->>'lastName';
  
  -- Get user email from auth.users
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  
  -- Check if profile exists
  SELECT COUNT(*) INTO profile_exists FROM public.profiles WHERE id = NEW.user_id;
  
  IF profile_exists > 0 THEN
    -- Update existing profile
    UPDATE public.profiles 
    SET 
      first_name = COALESCE(first_name_val, first_name),
      last_name = COALESCE(last_name_val, last_name),
      updated_at = now()
    WHERE id = NEW.user_id;
  ELSE
    -- Create new profile
    INSERT INTO public.profiles (id, first_name, last_name, email, created_at, updated_at)
    VALUES (NEW.user_id, first_name_val, last_name_val, user_email, now(), now());
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_onboarding table
CREATE TRIGGER sync_profile_from_onboarding_trigger
AFTER INSERT OR UPDATE OF onboarding_data ON public.user_onboarding
FOR EACH ROW
EXECUTE FUNCTION sync_profile_from_onboarding();

-- Backfill profiles for existing users
INSERT INTO public.profiles (id, first_name, last_name, email, created_at, updated_at)
SELECT 
  uo.user_id, 
  uo.onboarding_data->>'firstName', 
  uo.onboarding_data->>'lastName',
  au.email,
  now(),
  now()
FROM 
  public.user_onboarding uo
  JOIN auth.users au ON uo.user_id = au.id
WHERE 
  NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uo.user_id)
  AND uo.onboarding_data IS NOT NULL; 