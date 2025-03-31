-- Function to get user ID by email
-- This function needs to be executed in the Supabase SQL editor
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_input TEXT)
RETURNS TABLE (id UUID) 
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY 
  SELECT auth.users.id 
  FROM auth.users 
  WHERE auth.users.email = email_input;
END;
$$ LANGUAGE plpgsql; 