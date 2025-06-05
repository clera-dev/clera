import { signUpAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { SmtpMessage } from "../smtp-message";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

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
  if ("message" in searchParams) {
    return (
      <div className="w-full flex-1 flex items-center h-screen sm:max-w-md justify-center gap-2 p-4">
        <FormMessage message={searchParams} />
      </div>
    );
  }

  return (
    <>
      <form action={signUpAction} className="flex flex-col min-w-[380px] max-w-[380px] mx-auto bg-black/30 p-10 rounded-xl shadow-lg border border-gray-800">
        <h1 className="text-3xl font-medium mb-3">Sign up</h1>
        <p className="text-base text-foreground mb-8">
          Already have an account?{" "}
          <Link className="text-primary font-medium underline" href="/sign-in">
            Sign in
          </Link>
        </p>
        <div className="flex flex-col gap-6 [&>input]:mb-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-base">Email</Label>
            <Input name="email" placeholder="you@example.com" required className="h-12 text-base px-4" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-base">Password</Label>
            <PasswordInput
              name="password"
              placeholder="Your password"
              minLength={6}
              required
              className="h-12 text-base px-4"
            />
          </div>
          <div className="mt-4">
            <SubmitButton 
              pendingText="Signing up..."
              className="w-full h-12 text-base mt-2"
            >
              Sign up
            </SubmitButton>
          </div>
          <FormMessage message={searchParams} />
        </div>
      </form>
    </>
  );
}
