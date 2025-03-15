"use client";
import { motion, useInView } from "framer-motion";
import { cn } from "../lib/utils";
import dynamic from 'next/dynamic';
import { LucideIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";

// Dynamically import the WorldMap component with SSR disabled
const WorldMap = dynamic(() => import('./WorldMap'), { 
  ssr: false,
  loading: () => <div className="h-80 w-[140%] overflow-hidden rounded-lg opacity-0 absolute bottom-[-170px] sm:bottom-[-140px] left-[-20%] scale-[1.25] sm:scale-[0.95]"></div>
});

export const NewsCard = ({
  className,
  title,
  description,
  icon,
  iconBg,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  icon?: React.ReactNode;
  iconBg?: string;
}) => {
  const isLarge = className?.includes('md:row-span-2');
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, amount: 0.5 });
  
  // Detect if on mobile device
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Check on mount and when window resizes
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);
  
  // Auto-activate on mobile immediately
  useEffect(() => {
    if (isMobile) {
      // Set isHovered to true immediately for mobile
      setIsHovered(true);
    } else {
      // Reset isHovered to false for desktop when not actually hovered
      setIsHovered(false);
    }
  }, [isMobile]);
  
  return (
    <motion.div
      ref={ref}
      className={cn(
        "row-span-1 rounded-xl group/card hover:shadow-xl transition duration-200 shadow-input dark:shadow-none p-6 dark:bg-[#0a0a0f]/60 dark:border-white/[0.1] backdrop-blur-sm border border-white/5 justify-between flex flex-col relative overflow-hidden",
        isMobile ? "h-[480px]" : "",
        className
      )}
      whileHover={{ 
        y: -5,
        boxShadow: '0 10px 30px -15px rgba(255, 235, 59, 0.2)',
        borderColor: 'rgba(255, 235, 59, 0.2)'
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      onHoverStart={() => !isMobile && setIsHovered(true)}
      onHoverEnd={() => !isMobile && setIsHovered(false)}
      onTouchStart={() => isMobile && setIsHovered(true)}
    >
      {/* Content */}
      <div className="z-10 flex flex-col h-full">
        <div className="flex items-center mb-5">
          <div className={`${isLarge ? 'w-14 h-14' : 'w-12 h-12'} rounded-lg flex items-center justify-center bg-transparent relative flex-shrink-0`}>
            {/* Base Background with subtle constant glow */}
            <div className="absolute inset-0 rounded-lg bg-[#ffeb3b]/5 group-hover/card:bg-[#ffeb3b]/10 transition-colors duration-300" />
            
            {/* Constant subtle glow effect */}
            <div className="absolute inset-0 rounded-lg shadow-[0_0_10px_rgba(255,235,59,0.15)] group-hover/card:shadow-[0_0_15px_rgba(255,235,59,0.25)] transition-all duration-300"></div>
            
            {/* Border - White outline, turns yellow on hover */}
            <div className="absolute inset-0 rounded-lg border border-white/20 transition-all duration-300 group-hover/card:border-[#ffeb3b]/40 group-hover/card:bg-[rgba(255,235,59,0.08)]" />
            
            {/* Pulsing Glow Effect - Only visible on hover */}
            <motion.div
              className="absolute inset-0 rounded-lg bg-[#ffeb3b]/0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
              animate={{ 
                scale: [0.85, 1.05, 0.85], 
                opacity: [0, 0.15, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                repeatType: "loop"
              }}
            />
            
            {/* The Icon - White initially, yellow tint on hover */}
            <div className="relative z-10 text-white/90 group-hover/card:text-[#ffeb3b]/90 transition-colors duration-300">
              {icon}
            </div>
          </div>
          <div className="ml-3">
            <div className={`${isLarge ? 'text-2xl' : 'text-xl'} font-bold tracking-tight text-white`}>
              {title}
            </div>
          </div>
        </div>
        <div className={`font-normal text-slate-400 ${isLarge ? 'text-base leading-relaxed' : 'text-sm leading-relaxed'} ${isMobile ? 'mb-20' : 'mb-8'}`}>
          {description}
        </div>
        
        {/* Spacer that pushes content up to make room for world map */}
        <div className={`flex-grow ${isMobile ? 'min-h-[240px]' : ''}`}></div>
      </div>
      
      {/* World Map background with gradient overlay to ensure text readability */}
      <div className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${isMobile ? 'opacity-100' : (isHovered ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100')}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0a0a0f] to-[#0a0a0f]/20 z-[9]"></div>
        <div className={`${isMobile ? 'h-96' : 'h-80'} w-[140%] overflow-hidden rounded-lg absolute ${isMobile ? 'bottom-[-120px] left-[-20%] scale-[0.85]' : 'bottom-[-140px] left-[-20%] scale-[0.95]'}`}>
          {isInView && <WorldMap 
            highlightColor="#ffeb3b"
            baseColor="#353D69"
            backgroundColor="#0a0a15"
            dotSize={isMobile ? 0.5 : 0.4}
            dotColor="#ffffff"
            highlightedDotColor="#ffeb3b"
            isMobile={isMobile}
          />}
        </div>
      </div>
    </motion.div>
  );
}; 