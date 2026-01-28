"use client";

import Link from "next/link";
import Image from "next/image";

export default function LandingFooter() {
  return (
    <footer className="w-full py-12 bg-black text-gray-300 border-t border-gray-800">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start">
          {/* Left - Logo and description */}
          <div className="space-y-4">
            <Link href="/" className="inline-block">
              <Image
                src="/clera-logo.png"
                alt="Clera"
                width={100}
                height={32}
                className="h-8 w-auto"
              />
            </Link>
            <p className="text-sm max-w-xs text-gray-500">
              Get personalized investment guidance powered by science-backed intelligence.
            </p>
          </div>

          {/* Center - SEC Registration */}
          <div className="text-center">
            <p className="text-sm text-gray-500">
              SEC-Registered Investment Advisor
            </p>
            <p className="text-xs mt-1 text-gray-600">
              CRD #338073
            </p>
          </div>

          {/* Right - Contact and links */}
          <div className="space-y-4 md:text-right">
            <a
              href="mailto:support@askclera.com"
              className="block transition-colors text-gray-400 hover:text-white"
            >
              support@askclera.com
            </a>
            <div className="flex gap-4 md:justify-end text-sm text-gray-500">
              <Link href="/privacy" className="transition-colors hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-white">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="mt-10 pt-6 border-t text-center border-gray-800/50">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Clera. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
