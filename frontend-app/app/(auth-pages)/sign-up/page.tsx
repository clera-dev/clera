import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { SignUpForm } from "./sign-up-form";
import { Message } from "@/components/form-message";

export default async function Signup(props: {
  searchParams: Promise<Message>;
}) {
  // Check if user is already signed in
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is authenticated, redirect to portfolio
  if (user) {
    redirect("/portfolio");
  }

  const searchParams = await props.searchParams;

  return <SignUpForm searchParams={searchParams} />;
}
