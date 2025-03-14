"use client";
import { motion, useAnimation, useInView } from "framer-motion";
import { cn } from "@/lib/utils";
import React, { useEffect, useState, useRef } from 'react';

export const FinancialCard = ({
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
  const [isLoading, setIsLoading] = useState(true);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });
  
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
      }, 600);
      
      return () => clearTimeout(timeout);
    }
  }, [isMobile, isInView]);
  
  // Add effect to simulate loading state
  useEffect(() => {
    if (isInView) {
      // Simulate loading delay
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 600);
      
      return () => clearTimeout(timer);
    }
  }, [isInView]);
  
  // Generate realistic-looking stock data with fewer data points
  const generateStockData = (days = 45, volatility = 0.1, trend = 0.2, startPrice = 100) => {
    let price = startPrice;
    const data = [];

    for (let i = 0; i < days; i++) {
      // Add some randomness with a slight upward trend
      const change = price * (volatility * (Math.random() - 0.5) + trend * 0.01);
      price += change;
      data.push({ day: i, price: Math.max(price, 10) }); // Ensure price doesn't go below 10
    }

    return data;
  };

  // Normalize data to fit within the SVG viewBox
  const normalizeMultipleDatasets = (datasets: Array<{ day: number; price: number }[]>, height: number) => {
    // Find global min and max across all datasets
    const allPrices = datasets.flatMap((dataset) => dataset.map((d) => d.price));
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const range = maxPrice - minPrice;

    // Normalize each dataset using the global min/max
    return datasets.map((dataset) =>
      dataset.map((d) => ({
        ...d,
        normalizedPrice: height - ((d.price - minPrice) / range) * height * 0.7 - height * 0.15,
      }))
    );
  };
  
  // Generate two different stock datasets
  const [stockData1, setStockData1] = useState<any[]>([]);
  const [stockData2, setStockData2] = useState<any[]>([]);
  const [normalizedData1, setNormalizedData1] = useState<any[]>([]);
  const [normalizedData2, setNormalizedData2] = useState<any[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [animationComplete, setAnimationComplete] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Chart dimensions - make responsive for mobile
  const width = 600;
  const height = isMobile ? 100 : 120; // Smaller height on mobile

  useEffect(() => {
    // Generate data with different characteristics for each line
    const initialData1 = generateStockData(45, 0.1, 0.2, 100); // More stable, stronger uptrend
    const initialData2 = generateStockData(45, 0.15, 0.1, 120); // More volatile, weaker uptrend
    setStockData1(initialData1);
    setStockData2(initialData2);
  }, []);

  useEffect(() => {
    // Normalize both datasets to the same scale
    if (stockData1.length > 0 && stockData2.length > 0) {
      const [normalized1, normalized2] = normalizeMultipleDatasets([stockData1, stockData2], height);
      setNormalizedData1(normalized1);
      setNormalizedData2(normalized2);
    }
  }, [stockData1, stockData2]);

  // Create the path strings for both graph lines
  const pathData1 = normalizedData1.length
    ? `M${normalizedData1.map((d, i) => `${(i / (normalizedData1.length - 1)) * width},${d.normalizedPrice}`).join(" L")}`
    : "";

  const pathData2 = normalizedData2.length
    ? `M${normalizedData2.map((d, i) => `${(i / (normalizedData2.length - 1)) * width},${d.normalizedPrice}`).join(" L")}`
    : "";

  // Handle mouse movement over the SVG
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;

    setMousePosition({ x, y });

    // Find the closest point to the cursor
    const pointIndex = Math.min(
      Math.max(0, Math.round((x / svgRect.width) * (normalizedData1.length - 1))),
      normalizedData1.length - 1
    );

    setHoveredPoint(pointIndex);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };
  
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
        boxShadow: '0 10px 30px -15px rgba(72, 187, 120, 0.3)',
        borderColor: 'rgba(72, 187, 120, 0.3)'
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      onHoverStart={() => !isMobile && setIsHovered(true)}
      onHoverEnd={() => !isMobile && setIsHovered(false)}
      onTouchStart={() => {
        if (isMobile) {
          setIsHovered(true);
        }
      }}
    >
      {/* Content */}
      <div className="z-10 flex flex-col h-full">
        <div className="flex items-center mb-5">
          <div className={`${isLarge ? 'w-14 h-14' : 'w-12 h-12'} rounded-lg flex items-center justify-center bg-transparent relative flex-shrink-0`}>
            {/* Base Background with subtle constant glow */}
            <div className="absolute inset-0 rounded-lg bg-[#48bb78]/5 group-hover/card:bg-[#48bb78]/10 transition-colors duration-300" />
            
            {/* Constant subtle glow effect */}
            <div className="absolute inset-0 rounded-lg shadow-[0_0_10px_rgba(72,187,120,0.15)] group-hover/card:shadow-[0_0_15px_rgba(72,187,120,0.25)] transition-all duration-300"></div>
            
            {/* Border - White outline, turns green on hover */}
            <div className="absolute inset-0 rounded-lg border border-white/20 transition-all duration-300 group-hover/card:border-[#48bb78]/40 group-hover/card:bg-[rgba(72,187,120,0.08)]" />
            
            {/* Pulsing Glow Effect - Only visible on hover */}
            <motion.div
              className="absolute inset-0 rounded-lg bg-[#48bb78]/0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
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
            
            {/* The Icon - White initially, green on hover */}
            <div className="relative z-10 text-white/90 group-hover/card:text-[#48bb78]/90 transition-colors duration-300">
              {icon}
            </div>
          </div>
          <div className={`font-bold text-white ml-3 ${isLarge ? 'text-2xl' : 'text-xl'} flex-grow`}>
            {title}
          </div>
        </div>
        <div className={`font-normal text-slate-400 ${isLarge ? 'text-base leading-relaxed' : 'text-sm leading-relaxed'} ${isMobile ? 'mb-20' : 'mb-4'}`}>
          {description}
        </div>
        
        {/* Spacer that pushes content up to make room for chart */}
        <div className={`flex-grow ${isMobile ? 'min-h-[240px]' : ''}`}></div>
      </div>
      
      {/* Desktop Chart Animation */}
      {!isMobile && (
        <div 
          className={`absolute bottom-0 left-0 right-0 h-36 overflow-hidden transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
          style={{ 
            transform: 'scale(1) translateY(-15px)',
            transformOrigin: 'bottom center'
          }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0a0a0f] to-[#0a0a0f]/20 z-[9]"></div>
        
          {/* Chart container - Desktop only */}
          <div className={`absolute bottom-0 left-0 right-0 h-[65%] flex items-end justify-center z-[10] px-6 pb-1`}>
          <div className="relative w-full h-full">
            <svg
              ref={svgRef}
                width={width}
                height={height}
              viewBox={`0 0 ${width} ${height}`}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute top-0 left-1/2 transform -translate-x-1/2"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
                style={{ maxWidth: '100%' }}
            >
                {/* SVG content (grid lines, paths, etc.) */}
              {/* Grid lines - horizontal */}
              {[0, 1, 2].map((i) => (
                <line
                  key={`grid-${i}`}
                  x1="0"
                  y1={height * (i / 2)}
                  x2={width}
                  y2={height * (i / 2)}
                  stroke="#2d3748"
                  strokeWidth="1"
                  strokeDasharray="5,5"
                />
              ))}

              {/* Grid lines - vertical */}
              {[0, 1, 2, 3].map((i) => (
                <line
                  key={`vgrid-${i}`}
                  x1={width * (i / 3)}
                  y1="0"
                  x2={width * (i / 3)}
                  y2={height}
                  stroke="#2d3748"
                  strokeWidth="1"
                  strokeDasharray="5,5"
                />
              ))}

              {/* Area under the first graph line with sequential reveal */}
              {normalizedData1.length > 0 && (
                <motion.path
                  d={`${pathData1} L${width},${height} L0,${height} Z`}
                  fill="url(#greenGradient1)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered ? 0.15 : 0 }}
                  transition={{ duration: 1 }}
                  clipPath="url(#reveal-mask)"
                />
              )}

              {/* Area under the second graph line with sequential reveal */}
              {normalizedData2.length > 0 && (
                <motion.path
                  d={`${pathData2} L${width},${height} L0,${height} Z`}
                  fill="url(#greenGradient2)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered ? 0.15 : 0 }}
                  transition={{ duration: 1, delay: 0.2 }}
                  clipPath="url(#reveal-mask)"
                />
              )}

              {/* Line graphs with left-to-right reveal */}
              <motion.g>
                {/* Mask for revealing the lines from left to right */}
                <defs>
                  <motion.clipPath id="reveal-mask">
                    <motion.rect
                      x="0"
                      y="0"
                      width="0"
                      height={height}
                      initial={{ width: 0 }}
                      animate={{ width: isHovered ? width : 0 }}
                      transition={{ duration: 2, ease: "easeInOut" }}
                      onAnimationComplete={() => setAnimationComplete(true)}
                    />
                  </motion.clipPath>
                </defs>

                {/* Static path for first line */}
                <motion.path
                  d={pathData1}
                  fill="none"
                  stroke="url(#greenLineGradient1)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  clipPath="url(#reveal-mask)"
                />

                {/* Animated drawing effect for first line */}
                <motion.path
                  d={pathData1}
                  fill="none"
                  stroke="url(#greenLineGradient1)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 1 }}
                  animate={{ pathLength: isHovered ? 1 : 0, opacity: 0 }}
                  transition={{ duration: 2.5, ease: "easeInOut" }}
                  clipPath="url(#reveal-mask)"
                />

                {/* Static path for second line */}
                <motion.path
                  d={pathData2}
                  fill="none"
                  stroke="url(#greenLineGradient2)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  clipPath="url(#reveal-mask)"
                />

                {/* Animated drawing effect for second line */}
                <motion.path
                  d={pathData2}
                  fill="none"
                  stroke="url(#greenLineGradient2)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 1 }}
                  animate={{ pathLength: isHovered ? 1 : 0, opacity: 0 }}
                  transition={{ duration: 2.5, ease: "easeInOut", delay: 0.2 }}
                  clipPath="url(#reveal-mask)"
                />
              </motion.g>

              {/* Traveling highlight effect for first line */}
              {isHovered && (
                <motion.circle
                  r="3"
                  fill="white"
                  filter="url(#glow)"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    offsetDistance: ["0%", "100%"],
                  }}
                  transition={{
                    duration: 2,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatDelay: 1
                  }}
                  style={{ offsetPath: `path("${pathData1}")` }}
                />
              )}

              {/* Traveling highlight effect for second line */}
              {isHovered && (
                <motion.circle
                  r="3"
                  fill="white"
                  filter="url(#glow)"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    offsetDistance: ["0%", "100%"],
                  }}
                  transition={{
                    duration: 2,
                    ease: "easeInOut",
                    delay: 0.2,
                    repeat: Infinity,
                    repeatDelay: 1
                  }}
                  style={{ offsetPath: `path("${pathData2}")` }}
                />
              )}

              {/* Interactive hover points for first line */}
              {isHovered && normalizedData1.map((d, i) => (
                <motion.circle
                  key={`point1-${i}`}
                  cx={(i / (normalizedData1.length - 1)) * width}
                  cy={d.normalizedPrice}
                  r={hoveredPoint === i ? 3 : 0}
                  fill="#48bb78"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: (i / normalizedData1.length) * 2,
                    duration: 0.3,
                    type: "spring",
                    stiffness: 200,
                  }}
                />
              ))}

              {/* Interactive hover points for second line */}
              {isHovered && normalizedData2.map((d, i) => (
                <motion.circle
                  key={`point2-${i}`}
                  cx={(i / (normalizedData2.length - 1)) * width}
                  cy={d.normalizedPrice}
                  r={hoveredPoint === i ? 3 : 0}
                  fill="#48bb78"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: (i / normalizedData2.length) * 2 + 0.2,
                    duration: 0.3,
                    type: "spring",
                    stiffness: 200,
                  }}
                />
              ))}

              {/* Gradient definitions */}
              <defs>
                {/* Gradients for first line */}
                <linearGradient id="greenGradient1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#48bb78" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#48bb78" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="greenLineGradient1" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38a169" />
                  <stop offset="100%" stopColor="#48bb78" />
                </linearGradient>

                {/* Gradients for second line */}
                <linearGradient id="greenGradient2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#48bb78" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#48bb78" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="greenLineGradient2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38a169" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#48bb78" />
                </linearGradient>

                {/* Glow filter for the traveling highlight */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Hovered points and tooltips */}
              {hoveredPoint !== null && isHovered && normalizedData1[hoveredPoint] && normalizedData2[hoveredPoint] && (
                <>
                  {/* First line hover elements */}
                  <circle
                    cx={(hoveredPoint / (normalizedData1.length - 1)) * width}
                    cy={normalizedData1[hoveredPoint].normalizedPrice}
                    r="4"
                    fill="#48bb78"
                    className="animate-pulse"
                  />
                  <circle
                    cx={(hoveredPoint / (normalizedData1.length - 1)) * width}
                    cy={normalizedData1[hoveredPoint].normalizedPrice}
                    r="8"
                    fill="#48bb78"
                    className="opacity-20"
                  />

                  {/* Second line hover elements */}
                  <circle
                    cx={(hoveredPoint / (normalizedData2.length - 1)) * width}
                    cy={normalizedData2[hoveredPoint].normalizedPrice}
                    r="4"
                    fill="#48bb78"
                    className="animate-pulse"
                  />
                  <circle
                    cx={(hoveredPoint / (normalizedData2.length - 1)) * width}
                    cy={normalizedData2[hoveredPoint].normalizedPrice}
                    r="8"
                    fill="#48bb78"
                    className="opacity-20"
                  />

                  {/* Vertical guide line */}
                  <line
                    x1={(hoveredPoint / (normalizedData1.length - 1)) * width}
                    y1="0"
                    x2={(hoveredPoint / (normalizedData1.length - 1)) * width}
                    y2={height}
                    stroke="#475569"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                </>
              )}
            </svg>
          </div>
        </div>
        </div>
      )}
      
      {/* Mobile Chart Animations Container */}
      {isMobile && (
        <div 
          className="absolute bottom-4 h-[36%] left-0 right-0 w-full" 
          style={{ zIndex: 0 }}
        >
          {/* Loading State */}
          {isLoading && (
            <div className="w-full h-full flex items-center justify-center">
              <svg 
                className="animate-spin w-8 h-8 text-gray-400" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
          
          {/* Stock Chart Animation */}
          <div 
            className="w-full h-36 transition-all duration-300 ease-out"
          >
            <div className="relative w-full h-full">
              <svg
                ref={svgRef}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute top-0 left-1/2 transform -translate-x-1/2"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ maxWidth: '100%' }}
              >
                {/* Same SVG content as above */}
                {/* Grid lines - horizontal */}
                {[0, 1, 2].map((i) => (
                  <line
                    key={`grid-${i}`}
                    x1="0"
                    y1={height * (i / 2)}
                    x2={width}
                    y2={height * (i / 2)}
                    stroke="#2d3748"
                    strokeWidth="1"
                    strokeDasharray="5,5"
                  />
                ))}

                {/* Grid lines - vertical */}
                {[0, 1, 2, 3].map((i) => (
                  <line
                    key={`vgrid-${i}`}
                    x1={width * (i / 3)}
                    y1="0"
                    x2={width * (i / 3)}
                    y2={height}
                    stroke="#2d3748"
                    strokeWidth="1"
                    strokeDasharray="5,5"
                  />
                ))}

                {/* Area under the first graph line with sequential reveal */}
                {normalizedData1.length > 0 && (
                  <motion.path
                    d={`${pathData1} L${width},${height} L0,${height} Z`}
                    fill="url(#greenGradient1-mobile)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isHovered ? 0.15 : 0 }}
                    transition={{ duration: 1 }}
                    clipPath="url(#reveal-mask-mobile)"
                  />
                )}

                {/* Area under the second graph line with sequential reveal */}
                {normalizedData2.length > 0 && (
                  <motion.path
                    d={`${pathData2} L${width},${height} L0,${height} Z`}
                    fill="url(#greenGradient2-mobile)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isHovered ? 0.15 : 0 }}
                    transition={{ duration: 1, delay: 0.2 }}
                    clipPath="url(#reveal-mask-mobile)"
                  />
                )}

                {/* Line graphs with left-to-right reveal */}
                <motion.g>
                  {/* Mask for revealing the lines from left to right */}
                  <defs>
                    <motion.clipPath id="reveal-mask-mobile">
                      <motion.rect
                        x="0"
                        y="0"
                        width="0"
                        height={height}
                        initial={{ width: 0 }}
                        animate={{ width: isHovered ? width : 0 }}
                        transition={{ duration: 2, ease: "easeInOut" }}
                      />
                    </motion.clipPath>
                  </defs>

                  {/* Static path for first line */}
                  <motion.path
                    d={pathData1}
                    fill="none"
                    stroke="url(#greenLineGradient1-mobile)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    clipPath="url(#reveal-mask-mobile)"
                  />

                  {/* Animated drawing effect for first line */}
                  <motion.path
                    d={pathData1}
                    fill="none"
                    stroke="url(#greenLineGradient1-mobile)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 1 }}
                    animate={{ pathLength: isHovered ? 1 : 0, opacity: 0 }}
                    transition={{ duration: 2.5, ease: "easeInOut" }}
                    clipPath="url(#reveal-mask-mobile)"
                  />

                  {/* Static path for second line */}
                  <motion.path
                    d={pathData2}
                    fill="none"
                    stroke="url(#greenLineGradient2-mobile)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    clipPath="url(#reveal-mask-mobile)"
                  />

                  {/* Animated drawing effect for second line */}
                  <motion.path
                    d={pathData2}
                    fill="none"
                    stroke="url(#greenLineGradient2-mobile)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 1 }}
                    animate={{ pathLength: isHovered ? 1 : 0, opacity: 0 }}
                    transition={{ duration: 2.5, ease: "easeInOut", delay: 0.2 }}
                    clipPath="url(#reveal-mask-mobile)"
                  />
                </motion.g>

                {/* Mobile-specific gradients */}
                <defs>
                  {/* Gradients for first line */}
                  <linearGradient id="greenGradient1-mobile" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#48bb78" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#48bb78" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="greenLineGradient1-mobile" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38a169" />
                    <stop offset="100%" stopColor="#48bb78" />
                  </linearGradient>

                  {/* Gradients for second line */}
                  <linearGradient id="greenGradient2-mobile" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#48bb78" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#48bb78" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="greenLineGradient2-mobile" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38a169" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#48bb78" />
                  </linearGradient>

                  {/* Glow filter for the traveling highlight */}
                  <filter id="glow-mobile" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}; 