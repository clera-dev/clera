import "@/app/globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";
import ClientLayout from "@/components/ClientLayout";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import { EnvVarWarning } from "@/components/env-var-warning";
import HeaderController from "@/components/HeaderController";
import LogoLink from "@/components/LogoLink";
import ClientAuthButtons from "@/components/ClientAuthButtons";

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
        <ClientLayout>
          <div className="flex-1 w-full flex flex-col items-center">
            <HeaderController>
              <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
                <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
                  <div className="flex gap-5 items-center font-semibold">
                    <LogoLink />
                    <div className="flex items-center gap-2">
                    </div>
                  </div>
                  {!hasEnvVars ? <EnvVarWarning /> : <ClientAuthButtons />}
                </div>
              </nav>
            </HeaderController>
            <div className="flex flex-col w-full max-w-5xl p-4 pt-4">
              {children}
            </div>

            <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-8">
              <p>
                Learn more about{" "}
                <a
                  href="https://www.askclera.com/"
                  target="_blank"
                  className="font-bold hover:underline"
                  rel="noreferrer"
                >
                  Clera
                </a>
              </p>
              <ThemeSwitcher />
            </footer>
          </div>
        </ClientLayout>
      </body>
    </html>
  );
}
