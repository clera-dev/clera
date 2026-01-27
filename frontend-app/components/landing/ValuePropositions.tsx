"use client";

import { TracingBeam } from "@/components/ui/tracing-beam";
import { BlurFade } from "@/components/ui/blur-fade";

const propositions = [
  {
    number: "01",
    text: "SEC-registered, fiduciary advisor with zero conflict of interest.",
  },
  {
    number: "02",
    text: "Available 24/7 — ask anything about your portfolio, anytime.",
  },
  {
    number: "03",
    text: "Wall Street-level strategies, now accessible to everyone.",
  },
  {
    number: "04",
    text: "One simple price. No AUM fees. No hidden costs.",
  },
];

export default function ValuePropositions() {
  return (
    <section className="relative w-full bg-black py-24 px-6 overflow-hidden">
      <div className="max-w-4xl mx-auto">
        <TracingBeam className="px-6">
          <div className="space-y-16 py-10 pl-8 md:pl-12">
            {propositions.map((prop, index) => (
              <BlurFade
                key={prop.number}
                delay={0.1 * index}
                inView
                className="flex items-start gap-6 md:gap-8"
              >
                {/* Number */}
                <span className="text-5xl md:text-6xl font-mono font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent flex-shrink-0">
                  {prop.number}
                </span>

                {/* Text */}
                <p className="text-xl md:text-2xl text-gray-300 leading-relaxed pt-3">
                  {prop.text}
                </p>
              </BlurFade>
            ))}
          </div>
        </TracingBeam>
      </div>
    </section>
  );
}
