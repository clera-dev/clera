"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";

// Subtle Aurora Background component - dark mode only
function SubtleAuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-black">
      {/* Aurora effect - subtle animated gradients */}
      <div
        className="absolute inset-0 overflow-hidden opacity-30"
        style={{
          "--aurora": "repeating-linear-gradient(100deg, #3b82f6 10%, #a5b4fc 15%, #93c5fd 20%, #60a5fa 25%, #3b82f6 30%)",
        } as React.CSSProperties}
      >
        <motion.div
          animate={{
            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute -inset-[10px] opacity-20 blur-[100px]"
          style={{
            backgroundImage: "var(--aurora)",
            backgroundSize: "300% 200%",
          }}
        />
      </div>

      {/* Additional subtle glow orbs */}
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-[20%] left-[10%] w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px]"
      />
      <motion.div
        animate={{
          x: [0, -80, 0],
          y: [0, 80, 0],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 5,
        }}
        className="absolute bottom-[10%] right-[10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[120px]"
      />
    </div>
  );
}

export default function LandingPageWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black">
      <SubtleAuroraBackground />
      {children}
    </div>
  );
}
