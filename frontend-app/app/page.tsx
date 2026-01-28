import Hero from "@/components/hero";

// This ensures Next.js knows this page should not be statically rendered
export const dynamic = 'force-dynamic';

export default function Home() {
  // Authentication and redirect logic is now handled in middleware
  // This page will only be rendered for unauthenticated users
  return (
    <>
      <Hero />
    </>
  );
}
