import Link from "next/link";
import { Button } from "@/components/ui/button";

// Placeholder for Clera Logo - Replace with your actual logo component/SVG
const CleraLogo = () => (
  <svg
    className="w-10 h-10 text-blue-500" // Example styling
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    {/* Placeholder path, replace with actual logo */}
    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2 .895-2 2-2zM12 14c-2.21 0-4 1.79-4 4h8c0-2.21-1.79-4-4-4z"></path>
  </svg>
);

// Client-side auth buttons replacement for direct server component usage
const AuthButtons = () => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
      <Button asChild size="lg" className="w-full" variant="outline">
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild size="lg" className="w-full bg-blue-600 hover:bg-blue-700">
        <Link href="/sign-up">Sign up</Link>
      </Button>
    </div>
  );
};

export default function Hero() {
  return (
    <div className="flex flex-col lg:flex-row items-center justify-center min-h-screen w-full bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-200 p-8 gap-16">
      {/* Left Column: Content & Auth */}
      <div className="flex flex-col gap-6 lg:w-1/2 max-w-lg text-center lg:text-left items-center lg:items-start">
        <CleraLogo />
        <h1 className="text-4xl sm:text-5xl font-bold !leading-tight bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-400 bg-clip-text text-transparent">
          Meet Clera.
        </h1>
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-300">
          Your Personal AI Financial Advisor.
        </h2>
        <p className="text-lg text-gray-400 leading-relaxed">
          Get Wall Street-level investment guidance and portfolio management,
          powered by AI. Secure, personalized, and always available &mdash; all
          at a fraction of the cost.
        </p>

        {/* Use client-side buttons instead of HeaderAuth */}
        <AuthButtons />

        <Link
          href="https://www.askclera.com"
          target="_blank"
          rel="noreferrer"
          className="mt-6 text-blue-400 hover:text-blue-300 transition duration-200 flex items-center gap-2 group"
        >
          Learn more about Clera
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 transform group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Right Column: Visual Mockup */}
      <div className="lg:w-1/2 w-full max-w-xl mt-12 lg:mt-0">
        <div className="relative rounded-xl shadow-2xl overflow-hidden border border-gray-700/50 bg-gray-800/40 p-6 backdrop-blur-sm">
          {/* Mockup Header */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            </div>
             <span className="text-xs text-gray-500">Clera Dashboard Preview</span>
          </div>

          {/* Mockup Content - Simplified representation */}
          <div className="space-y-4">
            <div className="bg-gray-700/50 p-4 rounded-lg shadow-inner">
              <h3 className="font-semibold text-blue-400 mb-2">
                AI Portfolio Analysis
              </h3>
              <p className="text-sm text-gray-400">
                Clera identifies optimization opportunities based on your goals...
              </p>
              {/* Placeholder Chart */}
              <div className="h-20 bg-gray-600/30 rounded mt-2 animate-pulse"></div>
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg shadow-inner">
              <h3 className="font-semibold text-blue-400 mb-2">
                Personalized News Insights
              </h3>
              <p className="text-sm text-gray-400">
                Understand how market events impact your specific holdings...
              </p>
            </div>
             <div className="bg-gray-700/50 p-4 rounded-lg shadow-inner flex items-center gap-3">
               <svg className="w-6 h-6 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <p className="text-sm text-gray-400 italic">
                "Explain the latest tech stock volatility..."
              </p>
            </div>
          </div>
           {/* Subtle Glow Effect */}
           <div className="absolute inset-0 -z-10 overflow-hidden rounded-xl">
              <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-blue-600/30 blur-3xl opacity-50 animate-pulse"></div>
              <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-cyan-500/20 blur-3xl opacity-40 animate-pulse delay-1000"></div>
           </div>
        </div>
      </div>
    </div>
  );
}
