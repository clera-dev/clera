"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export default function LandingNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;

    // Show/hide based on scroll direction
    if (latest > previous && latest > 100) {
      setIsVisible(false);
    } else {
      setIsVisible(true);
    }

    // Background blur when scrolled
    setIsScrolled(latest > 50);
  });

  return (
    <motion.nav
      initial={{ y: 0 }}
      animate={{ y: isVisible ? 0 : -100 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-black/80 backdrop-blur-lg border-b border-gray-800/50"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/clera-logo.png"
            alt="Clera"
            width={100}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </Link>

        {/* CTA Button */}
        <Link href="/sign-up">
          <ShimmerButton
            shimmerColor="#60a5fa"
            background="linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)"
            borderRadius="0.5rem"
            className="h-10 px-5 text-sm font-semibold"
          >
            Try Clera
          </ShimmerButton>
        </Link>
      </div>
    </motion.nav>
  );
}
