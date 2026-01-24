"use client";

import { signUpAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import {
  PasswordInputWithRequirements,
  PASSWORD_REQUIREMENTS,
} from "@/components/ui/password-input-with-requirements";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";

interface SignUpFormProps {
  searchParams: Message;
}

export function SignUpForm({ searchParams }: SignUpFormProps) {
  const [password, setPassword] = useState("");

  // Check if all password requirements are met
  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((req) =>
    req.test(password)
  );

  if ("message" in searchParams) {
    return (
      <div className="w-full flex-1 flex items-center h-screen sm:max-w-md justify-center gap-2 p-4">
        <FormMessage message={searchParams} />
      </div>
    );
  }

  return (
    <form
      action={signUpAction}
      className="flex flex-col w-full min-w-[340px] max-w-[400px] mx-auto bg-card/50 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-xl border border-border/50"
    >
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
        Create your account
      </h1>
      <p className="text-sm sm:text-base text-muted-foreground mb-8">
        Already have an account?{" "}
        <Link className="text-primary font-medium hover:underline" href="/sign-in">
          Sign in
        </Link>
      </p>
      <div className="flex flex-col gap-5">
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
          <Label htmlFor="password" className="text-sm font-medium">
            Password
          </Label>
          <PasswordInputWithRequirements
            name="password"
            placeholder="Create a secure password"
            required
            autoComplete="new-password"
            className="h-11 text-sm px-4 bg-background/50 border-border/50 focus:border-primary/50"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="mt-2">
          <SubmitButton
            pendingText="Creating account..."
            className="w-full h-11 text-sm font-medium"
            disabled={!allRequirementsMet}
          >
            Create account
          </SubmitButton>
          {password.length > 0 && !allRequirementsMet && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Complete all password requirements to continue
            </p>
          )}
        </div>
        <FormMessage message={searchParams} />
      </div>
    </form>
  );
}
