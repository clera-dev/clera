"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

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
          // Force a router refresh to update server components
          router.refresh();
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          router.refresh();
        } else if (event === "TOKEN_REFRESHED" && session) {
          // Handle token refresh to ensure user state stays current
          setUser(session.user);
        }
        
        // Ensure loading is false after auth state changes
        setLoading(false);
      }
    );

    // Cleanup
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router]);

  const handleSignOut = async () => {
    try {
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

  // Don't render anything on server-side or while loading to prevent flash
  if (!isClient || loading) {
    return <div className="h-8 w-24 bg-gray-200 animate-pulse rounded-md"></div>;
  }

  return user ? (
    <div className="flex items-center gap-4">
      <span className="truncate max-w-[150px]">Hey, {user.email}!</span>
      <Button variant="outline" onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  ) : (
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