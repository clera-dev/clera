import { Button } from "@/components/ui/button";

interface WelcomePageProps {
  onContinue: () => void;
}

export default function WelcomePage({ onContinue }: WelcomePageProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold">Hey there! Let's get your account ready for your investing journey.</h1>
      <p className="text-muted-foreground">
        We'll ask you a few questions to set up your brokerage account so you can start investing.
      </p>
      <Button 
        onClick={onContinue}
        className="px-8 py-6 text-lg"
      >
        Continue
      </Button>
    </div>
  );
} 