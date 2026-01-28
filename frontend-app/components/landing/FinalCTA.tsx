"use client";

import Link from "next/link";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BlurFade } from "@/components/ui/blur-fade";

export default function FinalCTA() {
  return (
    <section className="relative w-full py-24 px-6 overflow-hidden bg-black">
      {/* Background spotlight */}
      <Spotlight
        className="-top-40 left-1/2 -translate-x-1/2"
        fill="#3b82f6"
      />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <BlurFade delay={0.1} inView>
          <p className="text-lg font-medium mb-4 text-blue-400">
            Elite advice. No elitist fees.
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold mb-6 text-white">
            Ready to invest smarter?
          </h2>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <p className="text-xl mb-10 max-w-xl mx-auto text-gray-400">
            Join investors getting personalized, conflict-free financial guidance.
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
                Try Clera
              </ShimmerButton>
            </Link>
          </div>
        </BlurFade>
      </div>

      {/* Gradient fade at edges */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  );
}
