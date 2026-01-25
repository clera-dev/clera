import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { SignInContent } from "./sign-in-content";

export default async function Login(props: { searchParams: Promise<Message> }) {
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
  return <SignInContent searchParams={searchParams} />;
}
