"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen w-full bg-black flex flex-col justify-center items-center overflow-hidden">
      {/* Spotlight background effect */}
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="#3b82f6"
      />

      <div className="container relative z-10 flex flex-col items-center justify-center w-full max-w-4xl mx-auto px-6 md:px-8 lg:px-10 py-8 gap-6 text-center">
        {/* Main headline - Meet Clera */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-7xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-400 bg-clip-text text-transparent"
        >
          Meet Clera.
        </motion.h1>

        {/* Secondary headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-2xl sm:text-4xl font-semibold text-gray-200 -mt-2"
        >
          Private wealth intelligence. Now yours.
        </motion.h2>

        {/* Value proposition */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-lg text-gray-400 leading-relaxed max-w-xl mt-2"
        >
          SEC-registered. Available 24/7. No conflict of interest.
          <br />
          Get elite investment intelligence at a fraction of the cost.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 w-full max-w-md mt-4"
        >
          <Link href="/sign-up" className="flex-1">
            <ShimmerButton
              shimmerColor="#60a5fa"
              background="linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)"
              borderRadius="0.75rem"
              className="w-full h-12 text-base font-semibold"
            >
              Try Clera
            </ShimmerButton>
          </Link>
          <Link href="#chat" className="flex-1">
            <button className="w-full h-12 px-6 text-base font-semibold text-gray-300 bg-transparent border border-gray-700 rounded-xl hover:bg-gray-900 hover:border-gray-600 transition-all duration-200">
              See How It Works
            </button>
          </Link>
        </motion.div>
      </div>

      {/* Gradient fade at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  );
}
