"use client";

import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import {
  MessageSquare,
  TrendingUp,
  PieChart,
  BookOpen,
  Shield,
  Award
} from "lucide-react";

const features = [
  {
    title: "Your Dedicated Advisor",
    description: "Always available. Never judges. Understands your complete financial picture.",
    icon: <MessageSquare className="h-6 w-6 text-blue-400" />,
    className: "md:col-span-2",
    header: (
      <div className="flex items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl">
        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 animate-pulse" />
      </div>
    ),
  },
  {
    title: "Real-Time Market Analysis",
    description: "Clera monitors markets 24/7 and alerts you to opportunities and risks.",
    icon: <TrendingUp className="h-6 w-6 text-green-400" />,
    header: (
      <div className="flex items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl">
        <TrendingUp className="h-10 w-10 text-green-400" />
      </div>
    ),
  },
  {
    title: "Smart Portfolio Management",
    description: "Automatic rebalancing, tax-loss harvesting, and diversification.",
    icon: <PieChart className="h-6 w-6 text-purple-400" />,
    header: (
      <div className="flex items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl">
        <PieChart className="h-10 w-10 text-purple-400" />
      </div>
    ),
  },
  {
    title: "Finance in Plain English",
    description: "No jargon. No confusing terms. Just clear, actionable advice.",
    icon: <BookOpen className="h-6 w-6 text-amber-400" />,
    header: (
      <div className="flex items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-amber-500/10 to-yellow-500/10 rounded-xl">
        <BookOpen className="h-10 w-10 text-amber-400" />
      </div>
    ),
  },
  {
    title: "Bank-Level Security",
    description: "256-bit encryption. Your data never leaves our secure servers.",
    icon: <Shield className="h-6 w-6 text-emerald-400" />,
    header: (
      <div className="flex items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-xl">
        <Shield className="h-10 w-10 text-emerald-400" />
      </div>
    ),
  },
  {
    title: "SEC-Registered Investment Advisor",
    description: "We're legally bound to act in your best interest. No conflicts. No hidden agendas. CRD #338073",
    icon: <Award className="h-6 w-6 text-blue-400" />,
    className: "md:col-span-2",
    header: (
      <div className="flex items-center justify-center h-full min-h-[100px] bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 rounded-xl">
        <div className="flex items-center gap-3">
          <Award className="h-10 w-10 text-blue-400" />
          <span className="text-2xl font-bold text-white">SEC Registered</span>
        </div>
      </div>
    ),
  },
];

export default function FeaturesBento() {
  return (
    <section className="relative w-full bg-black py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything you need to invest with confidence
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Powerful features designed to help you make smarter financial decisions.
            </p>
          </div>
        </BlurFade>

        {/* Bento Grid */}
        <BlurFade delay={0.2} inView>
          <BentoGrid className="max-w-5xl mx-auto">
            {features.map((feature, index) => (
              <BentoGridItem
                key={index}
                title={feature.title}
                description={feature.description}
                header={feature.header}
                icon={feature.icon}
                className={feature.className}
              />
            ))}
          </BentoGrid>
        </BlurFade>
      </div>
    </section>
  );
}
