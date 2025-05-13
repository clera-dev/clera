-- Create trigger function to create profile record when a user signs up
CREATE OR REPLACE FUNCTION create_profile_for_new_user()
RETURNS TRIGGER AS $$
DECLARE
  username TEXT;
BEGIN
  -- Extract username from email (part before @)
  username := split_part(NEW.email, '@', 1);
  
  -- Create profile with username as first name
  INSERT INTO public.profiles (id, first_name, email, created_at, updated_at)
  VALUES (NEW.id, username, NEW.email, now(), now());
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on auth.users table
CREATE TRIGGER create_profile_for_new_user_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_profile_for_new_user();

-- Backfill profiles for existing users who don't have a profile yet
INSERT INTO public.profiles (id, first_name, email, created_at, updated_at)
SELECT 
  au.id, 
  split_part(au.email, '@', 1), 
  au.email,
  now(),
  now()
FROM 
  auth.users au
WHERE 
  NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id); 