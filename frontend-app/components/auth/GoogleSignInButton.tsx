"use client";

import { createClient } from "@/utils/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface GoogleSignInButtonProps {
  /**
   * The mode determines the button text.
   * - "sign-in": Shows "Sign in with Google"
   * - "sign-up": Shows "Sign up with Google"
   */
  mode: "sign-in" | "sign-up";
  /**
   * Optional className for additional styling
   */
  className?: string;
}

/**
 * Google Sign In Button component that initiates OAuth flow with Supabase.
 * 
 * This component uses the PKCE flow for secure authentication.
 * After successful authentication, the user is redirected to /auth/callback
 * which handles session exchange and proper routing based on onboarding status.
 */
export function GoogleSignInButton({ mode, className }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();

      // Get the current origin for the redirect URL
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // Request offline access to get refresh token if needed
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (oauthError) {
        console.error("Google OAuth error:", oauthError);
        setError(oauthError.message || "Failed to initiate Google sign in");
        setIsLoading(false);
      }
      // Note: If successful, the user is redirected to Google's consent screen,
      // so we don't need to handle success here - the page will navigate away
    } catch (err) {
      console.error("Unexpected error during Google sign in:", err);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const buttonText = mode === "sign-in" ? "Sign in with Google" : "Sign up with Google";

  return (
    <div className="w-full">
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className={`w-full h-11 text-sm font-medium bg-background/50 border-border/50 hover:bg-accent/50 ${className || ""}`}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Connecting...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {/* Google Logo SVG */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.26c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
                fill="#EA4335"
              />
            </svg>
            {buttonText}
          </span>
        )}
      </Button>
      {error && (
        <p className="text-sm text-destructive mt-2 text-center">{error}</p>
      )}
    </div>
  );
}

/**
 * A divider component with "or" text for separating OAuth buttons from
 * email/password forms.
 */
export function AuthDivider() {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border/50" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card/50 px-2 text-muted-foreground">
          or continue with email
        </span>
      </div>
    </div>
  );
}
