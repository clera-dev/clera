"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen w-full flex flex-col justify-center items-center overflow-hidden bg-black">
      {/* Spotlight background effect */}
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="#3b82f6"
      />

      <div className="container relative z-10 flex flex-col items-center justify-center w-full max-w-4xl mx-auto px-6 md:px-8 lg:px-10 py-8 gap-5 text-center">
        {/* Glowing Clera circle logo - ABOVE the headline with lamp effect */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="relative"
        >
          {/* Lamp effect - glowing light behind the logo */}
          <motion.div
            animate={{
              opacity: [0.4, 0.7, 0.4],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 -z-10"
          >
            {/* Upper glow cone */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] bg-gradient-to-t from-cyan-500/30 via-blue-500/20 to-transparent blur-3xl" />
            {/* Side glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[100px] bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent blur-2xl" />
          </motion.div>

          <motion.div
            animate={{
              boxShadow: [
                "0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.3), 0 0 60px rgba(6, 182, 212, 0.2)",
                "0 0 30px rgba(59, 130, 246, 0.7), 0 0 60px rgba(59, 130, 246, 0.4), 0 0 80px rgba(6, 182, 212, 0.3)",
                "0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.3), 0 0 60px rgba(6, 182, 212, 0.2)",
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-20 h-20 sm:w-28 sm:h-28 rounded-full flex-shrink-0 overflow-hidden"
          >
            <Image
              src="/clera-circle.png"
              alt="Clera"
              width={112}
              height={112}
              className="w-full h-full object-cover"
              priority
            />
          </motion.div>
        </motion.div>

        {/* Main headline - Meet Clera with breathing gradient */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <motion.h1
            animate={{
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="text-7xl sm:text-9xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500"
            style={{
              backgroundSize: "200% 200%",
            }}
          >
            Meet Clera.
          </motion.h1>
        </motion.div>

        {/* Secondary headline - two lines */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="text-2xl sm:text-4xl font-semibold -mt-2 text-gray-200"
        >
          Private wealth intelligence.
          <br />
          <span className="text-gray-300">Now yours.</span>
        </motion.h2>

        {/* Value proposition - smaller and thinner */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="text-base sm:text-lg font-light leading-relaxed max-w-2xl mt-1 text-gray-500"
        >
          SEC-registered. Available 24/7. No conflict of interest.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="flex flex-col sm:flex-row gap-4 w-full max-w-md mt-4"
        >
          <Link href="/sign-up" className="flex-1">
            <ShimmerButton
              shimmerColor="#60a5fa"
              background="linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)"
              borderRadius="0.75rem"
              className="w-full h-14 text-lg font-semibold"
            >
              Try Clera
            </ShimmerButton>
          </Link>
          <Link href="#chat" className="flex-1">
            <button className="w-full h-14 px-6 text-lg font-semibold rounded-xl transition-all duration-200 text-gray-300 bg-transparent border border-gray-700 hover:bg-gray-900 hover:border-gray-600">
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
