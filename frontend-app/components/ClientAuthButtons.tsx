"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { clearUserSpecificLocalStorage } from "@/lib/utils/auth-storage";

export default function ClientAuthButtons() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    setIsClient(true);
    
    // Immediately check session on component mount
    const checkSession = async () => {
      try {
        // Get session first for immediate response
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Error checking session:", error);
          setUser(null);
        } else if (session) {
          setUser(session.user);
          console.log("User authenticated:", session.user.email);
        } else {
          setUser(null);
          console.log("No active session found");
        }
      } catch (err) {
        console.error("Error in session check:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Subscribe to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth state changed:", event, session?.user?.email);
        
        if (event === "SIGNED_IN" && session) {
          setUser(session.user);
          setLoading(false);
          // Force a router refresh to update server components
          router.refresh();
        } else if (event === "SIGNED_OUT") {
          // Clear localStorage to prevent cross-user session issues
          clearUserSpecificLocalStorage('auth-state-signed-out');

          setUser(null);
          setLoading(false);
          router.refresh();
        } else if (event === "TOKEN_REFRESHED" && session) {
          // Handle token refresh to ensure user state stays current
          setUser(session.user);
          setLoading(false);
        }
      }
    );

    // Cleanup
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router]);

  const handleSignOut = async () => {
    try {
      // Clear localStorage to prevent cross-user session issues
      clearUserSpecificLocalStorage('manual-sign-out');

      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
      } else {
        setUser(null);
        router.refresh();
        // Also redirect to home page
        router.push('/');
      }
    } catch (err) {
      console.error("Exception during sign out:", err);
    }
  };

  // Don't render anything on server-side to prevent flash
  if (!isClient) {
    return <div className="h-8 w-24 bg-gray-200 animate-pulse rounded-md"></div>;
  }
  
  // Show loading state only briefly, then show auth buttons
  if (loading) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild size="sm" variant="default">
          <Link href="/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  return user ? (
    <div className="flex items-center gap-2 sm:gap-4">
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleSignOut}
        className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
      >
        Sign out
      </Button>
    </div>
  ) : (
    <div className="flex gap-1 sm:gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant="default">
        <Link href="/sign-up">Sign up</Link>
      </Button>
    </div>
  );
} 