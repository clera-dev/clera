import "@/app/globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";
import ClientLayout from "@/components/ClientLayout";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { EnvVarWarning } from "@/components/env-var-warning";
import HeaderController from "@/components/HeaderController";
import ConditionalLogoLink from "@/components/ConditionalLogoLink";
import ClientAuthButtons from "@/components/ClientAuthButtons";
import FooterComponent from "@/components/FooterComponent";
import { PostHogProvider } from "@/components/PostHogProvider";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Clera - AI-Powered Financial Advisor",
  description: "Personalized financial advice and portfolio management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <PostHogProvider>
          <ClientLayout>
            {/* --- Top nav bar ------------------------------------------------ */}
            <HeaderController>
              <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 fixed top-0 right-0 bg-background z-50">
                <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
                  <div className="flex gap-5 items-center font-semibold">
                    <ConditionalLogoLink />
                  </div>
                  {!hasEnvVars ? <EnvVarWarning /> : <ClientAuthButtons />}
                </div>
              </nav>
            </HeaderController>

            {/* --- Page content ---------------------------------------------- */}
            <main className="flex-1 w-full flex flex-col items-center pt-16">
              <div className="flex flex-col w-full max-w-5xl p-4">
                {children}
              </div>
            </main>

            {/* --- Footer ---------------------------------------------------- */}
            {/* The FooterComponent already has its own logic for when to display */}
            {/* but it was being forced to render in the layout anyway */}
          </ClientLayout>
        </PostHogProvider>
      </body>
    </html>
  );
}