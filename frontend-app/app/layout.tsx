import "@/app/globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";
import ClientLayout from "@/components/ClientLayout";
// import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { EnvVarWarning } from "@/components/env-var-warning";
import HeaderController from "@/components/HeaderController";
import ConditionalLogoLink from "@/components/ConditionalLogoLink";
import ClientAuthButtons from "@/components/ClientAuthButtons";
import FooterComponent from "@/components/FooterComponent";
import MainContent from "@/components/MainContent";
import { PostHogProvider } from "@/components/PostHogProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"], display: "swap" });



const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Clera - AI-Powered Investment Advisor",
  description: "Personalized investment advice and portfolio management",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <TooltipProvider>
          <PostHogProvider>
            <ClientLayout>
              {/* --- Top nav bar ------------------------------------------------ */}
              <HeaderController>
                <nav className="w-full flex justify-center border-b border-b-foreground/10 h-14 sm:h-16 fixed top-0 right-0 bg-background z-50">
                  <div className="w-full max-w-screen-2xl flex justify-between items-center p-3 sm:p-4 px-4 sm:px-6 lg:px-8 text-sm">
                    <div className="flex gap-5 items-center font-semibold">
                      <ConditionalLogoLink />
                    </div>
                    <div className="flex justify-end">
                      {!hasEnvVars ? <EnvVarWarning /> : <ClientAuthButtons />}
                    </div>
                  </div>
                </nav>
              </HeaderController>

              {/* --- Page content ---------------------------------------------- */}
              <MainContent>
                {children}
              </MainContent>

              {/* --- Footer ---------------------------------------------------- */}
              {/* The FooterComponent already has its own logic for when to display */}
              {/* but it was being forced to render in the layout anyway */}
            </ClientLayout>
          </PostHogProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}