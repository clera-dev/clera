"use client";

import { BlurFade } from "@/components/ui/blur-fade";
import { Shield, Award, DollarSign } from "lucide-react";

const badges = [
  {
    icon: <Award className="h-8 w-8 text-blue-400" />,
    title: "SEC Registered",
    description: "CRD #338073",
  },
  {
    icon: <Shield className="h-8 w-8 text-emerald-400" />,
    title: "Bank-Level Security",
    description: "256-bit encryption",
  },
  {
    icon: <DollarSign className="h-8 w-8 text-amber-400" />,
    title: "No AUM Fees",
    description: "Just $9.99/month",
  },
];

export default function SocialProof() {
  return (
    <section className="relative w-full bg-black py-16 px-6 border-y border-gray-800/50">
      <div className="max-w-5xl mx-auto">
        <BlurFade delay={0.1} inView>
          <p className="text-center text-gray-500 text-sm uppercase tracking-wider mb-8">
            Trusted by investors nationwide
          </p>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {badges.map((badge, index) => (
              <div
                key={index}
                className="flex flex-col items-center text-center p-6 rounded-xl bg-gray-900/30 border border-gray-800/50 hover:border-gray-700 transition-colors"
              >
                <div className="mb-4 p-3 rounded-full bg-gray-800/50">
                  {badge.icon}
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">
                  {badge.title}
                </h3>
                <p className="text-gray-500 text-sm">{badge.description}</p>
              </div>
            ))}
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
