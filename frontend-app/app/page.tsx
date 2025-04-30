import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Hero from "@/components/hero";
// Remove unused imports if any
// import ConnectSupabaseSteps from "@/components/tutorial/connect-supabase-steps";
// import SignUpUserSteps from "@/components/tutorial/sign-up-user-steps";
// import { hasEnvVars } from "@/utils/supabase/check-env-vars";

export default async function Home() {
  // Await the client creation
  const supabase = await createClient();

  // Now getUser can be called
  const { data, error } = await supabase.auth.getUser();

  // Redirect if user is successfully fetched
  if (data?.user) {
    return redirect("/dashboard");
  }

  // Render the Hero component if there's an error or no user
  // No need for the else block from previous attempt
  return (
    <>
      <Hero />
    </>
  );
}
