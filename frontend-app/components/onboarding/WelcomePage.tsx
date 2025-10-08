import { Button } from "@/components/ui/button";

interface WelcomePageProps {
  onContinue: () => void;
  firstName?: string;
}

export default function WelcomePage({ onContinue, firstName }: WelcomePageProps) {
  return (
    <div className="flex flex-col justify-between min-h-[calc(100vh-12rem)] sm:min-h-[calc(100vh-16rem)]">
      <div className="flex flex-col items-center justify-center flex-1 px-4 pt-2 sm:pt-8 pb-4 sm:pb-8">
        <div className="max-w-2xl mx-auto space-y-3 sm:space-y-6 text-center">
          <div className="relative">
            <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-xl" />
            <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
            <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent relative">
              Hey there! I’m Clera.
            </h1>
          </div>
          
          <p className="text-lg sm:text-xl text-white">
            {firstName 
              ? "I'm your personal investment advisor here to help you with anything investment related. But before we start with that, let's get your account set up."
              : "I'm here to help you with anything investment related. But before we start with that, let's get your account set up."
            }
          </p>
          
          <div className="pt-6 sm:pt-8">
            <Button 
              onClick={onContinue}
              className="px-8 sm:px-10 py-4 sm:py-6 text-base sm:text-lg rounded-full bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg transition-all"
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
      <div className="w-full border-t border-border/40 mt-auto"></div>
    </div>
  );
} 