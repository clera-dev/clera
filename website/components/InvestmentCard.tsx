"use client";
import { motion, useAnimation, useInView } from "framer-motion";
import { cn } from "../lib/utils";
import React, { useEffect, useState, useRef } from 'react';

export const InvestmentCard = ({
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
  const isLarge = className?.includes('md:col-span-2');
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });
  
  // Asset allocation data for our chart - representing different asset classes
  const assetData = [
    { label: 'Stocks', value: 45, color: 'rgba(72, 187, 120, 0.9)' },
    { label: 'Bonds', value: 28, color: 'rgba(72, 187, 120, 0.85)' },
    { label: 'Crypto', value: 15, color: 'rgba(72, 187, 120, 0.8)' },
    { label: 'Commodities', value: 8, color: 'rgba(72, 187, 120, 0.75)' },
    { label: 'Cash', value: 4, color: 'rgba(72, 187, 120, 0.7)' },
  ];
  
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
  
  // Auto-activate on mobile when in view
  useEffect(() => {
    if (isMobile && isInView) {
      const timeout = setTimeout(() => {
        setIsHovered(true);
      }, 300);
      
      return () => clearTimeout(timeout);
    }
  }, [isMobile, isInView]);
  
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
        boxShadow: '0 10px 30px -15px rgba(126, 87, 194, 0.3)',
        borderColor: 'rgba(126, 87, 194, 0.3)'
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
        <div className="flex items-center mb-3">
          <div className={`${isLarge ? 'w-14 h-14' : 'w-12 h-12'} rounded-lg flex items-center justify-center bg-transparent relative flex-shrink-0`}>
            {/* Base Background with subtle constant glow */}
            <div className="absolute inset-0 rounded-lg bg-[#7e57c2]/5 group-hover/card:bg-[#7e57c2]/10 transition-colors duration-300" />
            
            {/* Constant subtle glow effect */}
            <div className="absolute inset-0 rounded-lg shadow-[0_0_10px_rgba(126,87,194,0.15)] group-hover/card:shadow-[0_0_15px_rgba(126,87,194,0.25)] transition-all duration-300"></div>
            
            {/* Border - White outline, turns purple on hover */}
            <div className="absolute inset-0 rounded-lg border border-white/20 transition-all duration-300 group-hover/card:border-[#7e57c2]/40 group-hover/card:bg-[rgba(126,87,194,0.08)]" />
            
            {/* Pulsing Glow Effect - Only visible on hover */}
            <motion.div
              className="absolute inset-0 rounded-lg bg-[#7e57c2]/0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
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
            
            {/* The Icon - White initially, purple on hover */}
            <div className="relative z-10 text-white/90 group-hover/card:text-[#7e57c2]/90 transition-colors duration-300">
              {icon}
            </div>
          </div>
          <div className={`font-bold text-white ml-3 ${isMobile ? 'text-xl' : (isLarge ? 'text-2xl' : 'text-xl')} flex-grow`}>
            {title}
          </div>
        </div>
        <div className={`font-normal text-slate-400 ${isMobile ? 'text-sm' : (isLarge ? 'text-base leading-relaxed' : 'text-sm leading-relaxed')} leading-relaxed ${isMobile ? 'mb-20' : 'mb-4'}`}>
          {description}
        </div>
        
        {/* Portfolio value display - top right - only visible on hover */}
        <motion.div 
          className={`absolute ${isMobile ? 'top-64' : 'top-6'} right-6 text-right`}
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="text-xs text-white/60 mb-1">PORTFOLIO VALUE</div>
          <div className="text-lg font-bold text-[#7e57c2]">$34,913.00</div>
        </motion.div>
        
        {/* Spacer that pushes content up to make room for chart */}
        <div className={`flex-grow ${isMobile ? 'min-h-[240px]' : ''}`}></div>
      </div>
      
      {/* 3D Bar Chart Animation */}
      <div className="absolute inset-0 w-full h-full">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0f]/80 to-[#0a0a0f]/20 z-[9]"></div>
        
        {/* Chart container */}
        <div className="absolute bottom-0 left-0 right-0 h-[60%] flex items-end justify-center z-[10] px-6 pb-12">
          <div className="relative w-full h-full flex items-end justify-around">
            {/* X and Y Axes - subtle purple lines - only visible on hover */}
            <motion.div 
              className="absolute bottom-0 left-0 w-full h-[1px] bg-[#7e57c2]/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            ></motion.div>
            <motion.div 
              className="absolute bottom-0 left-0 w-[1px] h-full bg-[#7e57c2]/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            ></motion.div>
            
            {/* Grid lines - vertical - only visible on hover */}
            {[...Array(isMobile ? 3 : 5)].map((_, i) => (
              <motion.div 
                key={`grid-v-${i}`} 
                className="absolute bottom-0 w-[1px] bg-[#7e57c2]/10 h-full"
                style={{ left: `${isMobile ? (33.3 * (i + 1)) : (20 * (i + 1))}%` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              ></motion.div>
            ))}
            
            {/* Grid lines - horizontal - only visible on hover */}
            {[...Array(isMobile ? 2 : 4)].map((_, i) => (
              <motion.div 
                key={`grid-h-${i}`} 
                className="absolute left-0 h-[1px] bg-[#7e57c2]/10 w-full"
                style={{ bottom: `${isMobile ? (50 * (i + 1)) : (25 * (i + 1))}%` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              ></motion.div>
            ))}
            
            {/* Bar Chart Columns */}
            {assetData.map((item, index) => (
              <div key={`bar-${index}`} className="relative h-full flex flex-col items-center justify-end" style={{ width: `${100 / assetData.length}%` }}>
                {/* 3D Bar */}
                <div className="relative w-[60%]">
                  {/* Front face of the bar */}
                  <motion.div
                    className="w-full bg-gradient-to-t from-[#5e35b1] to-[#7e57c2] rounded-t-sm relative z-20"
                    style={{ 
                      boxShadow: '0 0 15px rgba(126, 87, 194, 0.3)'
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: isHovered ? `${item.value * 1.2}px` : 0 }}
                    transition={{ 
                      duration: 0.5, 
                      delay: isHovered ? index * 0.1 : 0,
                      ease: "easeOut"
                    }}
                  >
                  </motion.div>
                  
                  {/* Right side of the bar (3D effect) */}
                  <motion.div
                    className="absolute top-0 right-0 w-[8px] bg-gradient-to-t from-[#4527a0] to-[#5e35b1] origin-top transform translate-x-full skew-y-[-45deg] rounded-b-sm z-10"
                    style={{
                      transformOrigin: 'top left'
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: isHovered ? `${item.value * 1.2}px` : 0 }}
                    transition={{ 
                      duration: 0.5, 
                      delay: isHovered ? index * 0.1 : 0,
                      ease: "easeOut"
                    }}
                  />
                  
                  {/* Top of the bar (3D effect) */}
                  <motion.div
                    className="absolute bottom-0 left-0 w-full h-[8px] bg-gradient-to-r from-[#7e57c2] to-[#5e35b1] origin-top transform translate-y-full skew-x-[-45deg] rounded-l-sm z-30"
                    style={{
                      transformOrigin: 'top left',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                    initial={{ opacity: 0, scaleX: 0.8 }}
                    animate={{ 
                      opacity: isHovered ? 1 : 0,
                      scaleX: isHovered ? 1 : 0.8
                    }}
                    transition={{ 
                      duration: 0.2,
                      delay: isHovered ? 0.1 + (index * 0.1) + 0.5 : 0
                    }}
                  />
                </div>
                
                {/* X-axis label */}
                <motion.div 
                  className={`absolute bottom-[-32px] text-center ${isMobile ? 'text-[9px]' : 'text-[12px]'} text-[#7e57c2]/70 w-full ${isMobile ? 'px-0.5' : 'px-1'} font-medium`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered ? 1 : 0 }}
                  transition={{ 
                    duration: 0.3,
                    delay: isHovered ? 0.8 + (index * 0.05) : 0
                  }}
                >
                  {item.label}
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}; 