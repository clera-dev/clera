import Link from "next/link";
import { Button } from "@/components/ui/button";

/* -------------------------------------------------------------------------------------------------
 * Local helpers
 * ------------------------------------------------------------------------------------------------*/
const CleraLogo = () => (
  <img src="/clera-logo copy.png" alt="Clera" className="h-10 w-auto" />
);

const AuthButtons = () => (
  <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
    <Button asChild size="lg" className="w-full" variant="outline">
      <Link href="/sign-in">Sign in</Link>
    </Button>
    <Button asChild size="lg" className="w-full bg-blue-600 hover:bg-blue-700">
      <Link href="/sign-up">Sign up</Link>
    </Button>
  </div>
);

/* -------------------------------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------------------------------*/
export default function Hero() {
  return (
    <div className="min-h-screen w-full flex justify-center items-start pt-24">
      <div className="w-full max-w-7xl mx-auto bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-200 rounded-lg overflow-hidden">
        <div className="container flex flex-col lg:flex-row items-center justify-between w-full px-6 md:px-8 lg:px-10 py-16 gap-12">
          {/* Left column -------------------------------------------------- */}
          <div className="w-full lg:w-[48%] flex flex-col gap-6 text-center lg:text-left items-center lg:items-start">
            <h1 className="text-4xl sm:text-6xl font-bold !leading-tight bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-400 bg-clip-text text-transparent">
              Meet Clera.
            </h1>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-300">
              Your Personal AI Financial Advisor.
            </h2>
            <p className="text-lg text-gray-400 leading-relaxed max-w-xl">
              Get Wall Street‑level investment guidance and portfolio management,
              powered by AI. Secure, personalized, and always available — all at
              a fraction of the cost.
            </p>

            {/* Auth buttons (client‑side) */}
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

          {/* Right column (mock‑up) -------------------------------------- */}
          {/* …unchanged code for dashboard preview… */}
        </div>
      </div>
    </div>
  );
}