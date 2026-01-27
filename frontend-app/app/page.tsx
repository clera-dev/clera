import nextDynamic from 'next/dynamic';

// Eager load above-fold components
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";

// Lazy load below-fold sections for better performance
const ValuePropositions = nextDynamic(() => import("@/components/landing/ValuePropositions"));
const AIConversation = nextDynamic(() => import("@/components/landing/AIConversation"));
const ComparisonChart = nextDynamic(() => import("@/components/landing/ComparisonChart"));
const FeaturesBento = nextDynamic(() => import("@/components/landing/FeaturesBento"));
const FAQSection = nextDynamic(() => import("@/components/landing/FAQSection"));
const FinalCTA = nextDynamic(() => import("@/components/landing/FinalCTA"));
const DisclaimerSection = nextDynamic(() => import("@/components/landing/DisclaimerSection"));
const LandingFooter = nextDynamic(() => import("@/components/landing/LandingFooter"));

// This ensures Next.js knows this page should not be statically rendered
export const dynamic = 'force-dynamic';

export default function Home() {
  // Authentication and redirect logic is now handled in middleware
  // This page will only be rendered for unauthenticated users
  return (
    <main className="bg-black min-h-screen">
      <LandingNavbar />
      <HeroSection />
      <ValuePropositions />
      <AIConversation />
      <ComparisonChart />
      <FeaturesBento />
      <FAQSection />
      <FinalCTA />
      <DisclaimerSection />
      <LandingFooter />
    </main>
  );
}
