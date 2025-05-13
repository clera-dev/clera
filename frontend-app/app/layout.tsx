import "@/app/globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";
import ClientLayout from "@/components/ClientLayout";
import HeaderAuth from "@/components/header-auth";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { EnvVarWarning } from "@/components/env-var-warning";
import HeaderController from "@/components/HeaderController";
import LogoLink from "@/components/LogoLink";
import BackToTopButton from "@/components/BackToTopButton";
import FooterComponent from "@/components/FooterComponent";
import ConditionalLogoLink from "@/components/ConditionalLogoLink";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

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
        <div className="flex flex-col min-h-screen">
          {/* Header that spans full width with sign-out button */}
          <HeaderController>
            <div className="w-full border-b border-b-foreground/10 h-16 bg-background fixed top-0 right-0 z-50 flex justify-end">
              <div className="flex justify-end items-center p-3 px-5 text-sm h-full">
                {!hasEnvVars ? <EnvVarWarning /> : <HeaderAuth />}
              </div>
            </div>
          </HeaderController>

          {/* Main content with sidebar and content area */}
          <ClientLayout>
            {children}
          </ClientLayout>
        </div>
      </body>
    </html>
  );
}
