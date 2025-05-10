import { Button } from "@/components/ui/button";

interface WelcomePageProps {
  onContinue: () => void;
}

export default function WelcomePage({ onContinue }: WelcomePageProps) {
  return (
    <div className="flex flex-col justify-between h-[calc(100vh-12rem)]">
      <div className="flex flex-col items-center justify-center flex-1 px-4 pt-16">
        <div className="max-w-lg mx-auto space-y-8">
          <h1 className="text-3xl font-bold">Hey there! Let's get your account ready for your investing journey.</h1>
          <p className="text-muted-foreground">
            We'll ask you a few questions to set up your brokerage account so you can start investing.
          </p>
          <div className="pt-8">
            <Button 
              onClick={onContinue}
              className="px-8 py-6 text-lg"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
      <div className="w-full border-t border-border/40 mt-auto"></div>
    </div>
  );
} 