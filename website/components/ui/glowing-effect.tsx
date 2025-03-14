"use client";

import React, { useEffect, useRef } from "react";

interface GlowingEffectProps {
  spread?: number;
  glow?: boolean;
  disabled?: boolean;
}

export const GlowingEffect = ({
  spread = 60,
  glow = true,
  disabled = false,
}: GlowingEffectProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled || !glow) return;

    const container = containerRef.current;
    const glowElement = glowRef.current;

    if (!container || !glowElement) return;

    const updateMousePosition = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      glowElement.style.background = `
        radial-gradient(
          ${spread}px at ${x}px ${y}px,
          rgba(66, 153, 225, 0.4) 0%,
          transparent 80%
        )
      `;
    };

    const handleMouseLeave = () => {
      glowElement.style.background = 'transparent';
    };

    container.addEventListener("mousemove", updateMousePosition);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", updateMousePosition);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [disabled, glow, spread]);

  return (
    <div className="absolute -inset-[1px] rounded-2.5xl z-0">
      <div ref={containerRef} className="absolute inset-0 rounded-2.5xl">
        <div
          ref={glowRef}
          className="absolute inset-0 rounded-2.5xl transition-all duration-150"
        />
      </div>
      <div className="absolute inset-0 rounded-2.5xl bg-gradient-to-b from-white/[0.08] to-transparent" />
    </div>
  );
}; 