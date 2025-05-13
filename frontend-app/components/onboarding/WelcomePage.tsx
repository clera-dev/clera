import { Button } from "@/components/ui/button";

interface WelcomePageProps {
  onContinue: () => void;
}

export default function WelcomePage({ onContinue }: WelcomePageProps) {
  return (
    <div className="flex flex-col justify-between min-h-[calc(100vh-16rem)]">
      <div className="flex flex-col items-center justify-center flex-1 px-4 pt-8 pb-16">
        <div className="max-w-2xl mx-auto space-y-8 text-center">
          <div className="relative">
            <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-xl" />
            <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent relative">
              Welcome to Your Financial Journey
            </h1>
          </div>
          
          <p className="text-xl text-muted-foreground">
            We'll help you set up your brokerage account so you can start building wealth with Clera.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-card hover:bg-card/80 p-6 rounded-lg shadow-md border border-border/30 transition-all">
              <div className="text-primary text-xl font-bold mb-2">Step 1</div>
              <p>Complete your account information</p>
            </div>
            <div className="bg-card hover:bg-card/80 p-6 rounded-lg shadow-md border border-border/30 transition-all">
              <div className="text-primary text-xl font-bold mb-2">Step 2</div>
              <p>Review and accept terms</p>
            </div>
            <div className="bg-card hover:bg-card/80 p-6 rounded-lg shadow-md border border-border/30 transition-all">
              <div className="text-primary text-xl font-bold mb-2">Step 3</div>
              <p>Start investing with Clera</p>
            </div>
          </div>
          
          <div className="pt-12">
            <Button 
              onClick={onContinue}
              className="px-10 py-6 text-lg rounded-full bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg transition-all"
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