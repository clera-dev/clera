"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BlurFade } from "@/components/ui/blur-fade";

export default function FinalCTA() {
  return (
    <section className="relative w-full bg-black py-24 px-6 overflow-hidden">
      {/* Background spotlight */}
      <Spotlight
        className="-top-40 left-1/2 -translate-x-1/2"
        fill="#3b82f6"
      />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <BlurFade delay={0.1} inView>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Ready to invest smarter?
          </h2>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <p className="text-xl text-gray-400 mb-10 max-w-xl mx-auto">
            Join thousands of investors getting personalized, conflict-free financial guidance.
          </p>
        </BlurFade>

        <BlurFade delay={0.3} inView>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/sign-up">
              <ShimmerButton
                shimmerColor="#60a5fa"
                background="linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)"
                borderRadius="0.75rem"
                className="h-14 px-10 text-lg font-semibold"
              >
                Get Started Free
              </ShimmerButton>
            </Link>
          </div>
        </BlurFade>

        <BlurFade delay={0.4} inView>
          <p className="text-gray-500 text-sm mt-6">
            No credit card required
          </p>
        </BlurFade>
      </div>

      {/* Gradient fade at edges */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  );
}
