"use client";

import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { GoogleSignInButton, AuthDivider } from "@/components/auth/GoogleSignInButton";

interface SignInContentProps {
  searchParams: Message;
}

export function SignInContent({ searchParams }: SignInContentProps) {
  return (
    <div className="flex flex-col w-full min-w-[340px] max-w-[400px] mx-auto bg-card/50 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-xl border border-border/50">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
        Welcome back
      </h1>
      <p className="text-sm sm:text-base text-muted-foreground mb-6">
        Don't have an account?{" "}
        <Link className="text-primary font-medium hover:underline" href="/sign-up">
          Sign up
        </Link>
      </p>

      {/* Google Sign In Button */}
      <GoogleSignInButton mode="sign-in" />

      {/* Divider */}
      <AuthDivider />

      {/* Email/Password Form */}
      <form action={signInAction} className="flex flex-col gap-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email address
          </Label>
          <Input
            name="email"
            type="email"
            placeholder="name@example.com"
            required
            autoComplete="email"
            className="h-11 text-sm px-4 bg-background/50 border-border/50 focus:border-primary/50"
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <Link
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              href="/forgot-password"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            name="password"
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            className="h-11 text-sm px-4 bg-background/50 border-border/50 focus:border-primary/50"
          />
        </div>
        <div className="mt-2">
          <SubmitButton
            pendingText="Signing in..."
            className="w-full h-11 text-sm font-medium"
          >
            Sign in
          </SubmitButton>
        </div>
        <FormMessage message={searchParams} />
      </form>
    </div>
  );
}
