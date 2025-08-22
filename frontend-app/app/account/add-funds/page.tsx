"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import ManualBankForm from "@/components/funding/ManualBankForm";
import TransferSuccessDialog from "@/components/funding/TransferSuccessDialog";
import { createClient } from "@/utils/supabase/client";
import { getAlpacaAccountId } from "@/lib/utils";

export default function AddFundsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("User");

  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [bankLast4, setBankLast4] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push("/sign-in");
          return;
        }

        // Fetch user's first name from onboarding data
        try {
          const { data: onboardingData, error: onboardingError } = await supabase
            .from('user_onboarding')
            .select('onboarding_data, alpaca_account_id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!onboardingError && onboardingData?.onboarding_data) {
            const parsed = typeof onboardingData.onboarding_data === 'string'
              ? JSON.parse(onboardingData.onboarding_data)
              : onboardingData.onboarding_data;
            if (parsed?.firstName) {
              setUserName(parsed.firstName);
            }
          }

          // Determine Alpaca account id (prefer from helper)
          const acctId = await getAlpacaAccountId();
          if (acctId) {
            setAlpacaAccountId(acctId);
          } else if (onboardingData?.alpaca_account_id) {
            setAlpacaAccountId(onboardingData.alpaca_account_id);
          } else {
            setError("Unable to determine your brokerage account. Please try again later.");
          }
        } catch (e) {
          console.error("Error loading onboarding/account data:", e);
          setError("We couldn't load your account information. Please try again.");
        }
      } catch (e) {
        console.error("Unexpected error loading add funds page:", e);
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  // Lock body scroll on mobile; allow internal container to scroll if content overflows
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    if (!isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleFundingComplete = (amount?: string, last4?: string) => {
    setTransferAmount(amount || "");
    setBankLast4(last4 || "");
    setIsSuccessDialogOpen(true);
  };

  const handleSuccessDialogClose = () => {
    setIsSuccessDialogOpen(false);
    router.push('/dashboard');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-40 w-full mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 h-[100dvh] overflow-y-auto overscroll-contain sm:h-auto sm:overflow-visible">
      {error && (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {alpacaAccountId ? (
        <ManualBankForm
          alpacaAccountId={alpacaAccountId}
          userName={userName}
          onTransferComplete={handleFundingComplete}
          onBack={() => router.push('/dashboard')}
        />
      ) : (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>Missing account information. Please return to the dashboard and try again.</AlertDescription>
        </Alert>
      )}

      <TransferSuccessDialog
        isOpen={isSuccessDialogOpen}
        onClose={handleSuccessDialogClose}
        amount={transferAmount}
        bankLast4={bankLast4}
      />
    </div>
  );
}


