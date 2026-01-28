"use client";

import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import { motion } from "motion/react";
import {
  Brain,
  Globe,
  MessageSquareText,
  Lock,
  Sparkles,
  Shield,
} from "lucide-react";

// Animated gradient circle component for Clera branding
const AnimatedGradientCircle = ({ size = "w-16 h-16", delay = 0 }: { size?: string; delay?: number }) => (
  <motion.div
    initial={{ scale: 0.8, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.6, delay }}
    className={`${size} rounded-full bg-gradient-to-br from-blue-500 via-blue-400 to-cyan-400 shadow-lg shadow-blue-500/30`}
  />
);

// Connected data points visualization
const DataPointsVisualization = () => (
  <div className="relative w-full h-full min-h-[120px] flex items-center justify-center">
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative"
    >
      {/* Central circle */}
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
        <Brain className="w-6 h-6 text-white" />
      </div>

      {/* Orbiting dots */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <motion.div
          key={i}
          animate={{
            rotate: [angle, angle + 360],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 flex items-center justify-center"
          style={{ transformOrigin: "center center" }}
        >
          <div
            className="w-3 h-3 rounded-full bg-blue-400/60"
            style={{ transform: `translateX(${35 + i * 3}px)` }}
          />
        </motion.div>
      ))}
    </motion.div>
  </div>
);

// World map with dots visualization
const WorldMapVisualization = () => (
  <div className="relative w-full h-full min-h-[120px] flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-900/30 to-slate-900/50">
    {/* Simplified world representation with glowing dots */}
    <div className="relative w-full h-full">
      {/* Grid lines */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(5)].map((_, i) => (
          <div key={`h-${i}`} className="absolute w-full h-px bg-blue-400/30" style={{ top: `${20 + i * 15}%` }} />
        ))}
        {[...Array(7)].map((_, i) => (
          <div key={`v-${i}`} className="absolute h-full w-px bg-blue-400/30" style={{ left: `${10 + i * 13}%` }} />
        ))}
      </div>

      {/* City dots with pulse */}
      {[
        { x: 20, y: 35, size: "w-2 h-2" },
        { x: 45, y: 30, size: "w-3 h-3" },
        { x: 75, y: 40, size: "w-2.5 h-2.5" },
        { x: 55, y: 55, size: "w-2 h-2" },
        { x: 85, y: 50, size: "w-2.5 h-2.5" },
        { x: 30, y: 60, size: "w-2 h-2" },
      ].map((dot, i) => (
        <motion.div
          key={i}
          className={`absolute ${dot.size} rounded-full bg-cyan-400`}
          style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.3,
          }}
        >
          <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-50" />
        </motion.div>
      ))}

      <Globe className="absolute bottom-2 right-2 w-5 h-5 text-blue-400/40" />
    </div>
  </div>
);

// Transformation visualization
const TransformationVisualization = () => (
  <div className="relative w-full h-full min-h-[120px] flex items-center justify-center">
    <div className="flex items-center gap-4">
      {/* Complex text/numbers */}
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-xs font-mono text-gray-500 leading-tight"
      >
        <div>δ²/dx²</div>
        <div>∑(n=1)</div>
        <div>σ²=...</div>
      </motion.div>

      {/* Arrow */}
      <motion.div
        animate={{ x: [0, 5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-blue-400"
      >
        →
      </motion.div>

      {/* Simple output */}
      <div className="flex items-center gap-2 bg-emerald-500/20 rounded-xl px-3 py-2">
        <span className="text-emerald-400 text-sm font-medium">+12.4%</span>
        <span className="text-white">✓</span>
      </div>
    </div>
  </div>
);

// Vault/Key visualization
const VaultVisualization = () => (
  <div className="relative w-full h-full min-h-[120px] flex items-center justify-center">
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="relative"
    >
      {/* Vault door */}
      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-gray-600 flex items-center justify-center shadow-xl">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
        >
          <Sparkles className="w-8 h-8 text-amber-400" />
        </motion.div>
      </div>

      {/* Key/Clera circle */}
      <motion.div
        animate={{ x: [0, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/50"
      />
    </motion.div>
  </div>
);

// Security shield visualization
const SecurityVisualization = () => (
  <div className="relative w-full h-full min-h-[120px] flex items-center justify-center">
    <motion.div
      animate={{
        boxShadow: [
          "0 0 0 0 rgba(59, 130, 246, 0)",
          "0 0 0 20px rgba(59, 130, 246, 0.1)",
          "0 0 0 0 rgba(59, 130, 246, 0)",
        ],
      }}
      transition={{ duration: 2, repeat: Infinity }}
      className="relative"
    >
      <div className="w-20 h-24 relative">
        {/* Shield shape */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/20 to-cyan-500/10 rounded-t-full rounded-b-[60%]" />
        <div className="absolute inset-1 bg-gradient-to-b from-blue-600/30 to-cyan-600/20 rounded-t-full rounded-b-[60%] flex items-center justify-center">
          <Shield className="w-8 h-8 text-blue-400" />
        </div>

        {/* Clera circle at center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400" />
      </div>

      {/* Lock icon */}
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="absolute -top-2 left-1/2 -translate-x-1/2"
      >
        <Lock className="w-4 h-4 text-emerald-400" />
      </motion.div>
    </motion.div>
  </div>
);

const features = [
  {
    title: "Intelligence That Learns You",
    description: "Clera analyzes your complete financial picture: income, goals, risk tolerance, tax situation; and continuously adapts as your life changes.",
    icon: <Brain className="h-5 w-5 text-blue-400" />,
    className: "md:col-span-2",
    header: <DataPointsVisualization />,
  },
  {
    title: "Relevant Information, At Your Fingertips",
    description: "Intelligent portfolio-aware news stories and in-depth market analysis tailored to your holdings.",
    icon: <Globe className="h-5 w-5 text-cyan-400" />,
    header: <WorldMapVisualization />,
  },
  {
    title: "Complexity, Translated",
    description: "No jargon. No confusing charts. Just clear explanations and actionable next steps you can actually understand.",
    icon: <MessageSquareText className="h-5 w-5 text-emerald-400" />,
    header: <TransformationVisualization />,
  },
  {
    title: "Strategies Reserved for the Elite",
    description: "Access allocation models and rebalancing approaches typically available only to high-net-worth family offices.",
    icon: <Sparkles className="h-5 w-5 text-amber-400" />,
    className: "md:col-span-2",
    header: <VaultVisualization />,
  },
  {
    title: "Your Data. Locked Down.",
    description: "Bank-level 256-bit encryption. SEC-registered fiduciary. We don't sell your data, ever. Your financial life stays yours.",
    icon: <Shield className="h-5 w-5 text-blue-400" />,
    className: "md:col-span-3",
    header: <SecurityVisualization />,
  },
];

export default function FeaturesBento() {
  return (
    <section className="relative w-full py-24 px-6 overflow-hidden bg-black">
      {/* Background gradient effect */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[800px]">
          <motion.div
            animate={{
              opacity: [0.3, 0.5, 0.3],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 rounded-full blur-3xl bg-gradient-radial from-blue-500/20 via-blue-600/10 to-transparent"
          />
          <motion.div
            animate={{
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
            className="absolute top-[20%] right-[10%] w-[400px] h-[400px] rounded-full blur-3xl bg-gradient-radial from-cyan-500/15 via-transparent to-transparent"
          />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Section Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
              Everything you need to invest with confidence
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-gray-400">
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
