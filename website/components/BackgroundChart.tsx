'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

export default function BackgroundChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isLargeDisplay, setIsLargeDisplay] = useState(false)
  
  // Check if we're on a mobile device or large display
  useEffect(() => {
    const checkViewportSize = () => {
      setIsMobile(window.innerWidth < 768)
      setIsLargeDisplay(window.innerWidth > 1920)
    }
    
    // Run on initial render
    checkViewportSize()
    
    // Listen for resize events
    window.addEventListener('resize', checkViewportSize)
    return () => window.removeEventListener('resize', checkViewportSize)
  }, [])
  
  // Additional handler for scroll events on large displays
  useEffect(() => {
    if (!isLargeDisplay) return
    
    const handleScroll = () => {
      if (window.scrollY === 0) {
        // Reset chart position when returning to top on large displays
        if (containerRef.current) {
          containerRef.current.style.transform = 'translate(-50%, 0) translateZ(0)'
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.style.transform = 'translate(-50%, 0)'
            }
          }, 10)
        }
      }
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isLargeDisplay])
  
  // Generate points for the chart immediately (not state dependent)
  const chartPoints = generateChartPoints()
  
  // Create SVG path from points immediately
  const pathString = createSvgPath(chartPoints)
  const areaPathString = pathString + ` L${chartPoints[chartPoints.length - 1]?.x || 0},${500} L0,${500} Z`
  
  // Generate points for a more dynamic upward trending chart
  function generateChartPoints() {
    const points = []
    // Reduce segments on mobile for better performance
    const segments = isMobile ? 25 : 50
    // Adjust width to match navigation container
    const width = 1400 
    const height = 500
    const stepX = width / segments
    
    // Start at the bottom left
    let prevY = height * 0.8
    let volatility = isMobile ? 0.3 : 0.4
    
    // Define key change points for trend direction changes
    const trendChanges = [
      { point: Math.floor(segments * 0.2), volatility: isMobile ? 0.4 : 0.5, trend: -1.2 },
      { point: Math.floor(segments * 0.35), volatility: isMobile ? 0.5 : 0.7, trend: -0.8 },
      { point: Math.floor(segments * 0.5), volatility: isMobile ? 0.4 : 0.6, trend: -1.5 },
      { point: Math.floor(segments * 0.65), volatility: isMobile ? 0.6 : 0.9, trend: 0.7 }, // Small downward correction
      { point: Math.floor(segments * 0.8), volatility: isMobile ? 0.5 : 0.7, trend: -1.3 },
    ]
    
    for (let i = 0; i <= segments; i++) {
      const x = i * stepX
      
      // Find the current trend section
      let currentTrend = -0.8 // Default trend
      let currentVolatility = volatility
      
      for (const change of trendChanges) {
        if (i > change.point && i < change.point + 5) {
          // In a transition zone, swing more dramatically
          currentVolatility = change.volatility
          currentTrend = change.trend
          break
        }
      }
      
      // Generate a random movement with variable trend
      const randMove = (Math.random() * 2 - 1) * currentVolatility * height * 0.15
      const trendMove = currentTrend * (height / segments) * 1.2
      
      let y = prevY + randMove + trendMove
      
      // Keep it within bounds
      y = Math.max(height * 0.1, Math.min(height * 0.9, y))
      
      points.push({ x, y })
      prevY = y
    }
    
    return points
  }
  
  // Create SVG path from points
  function createSvgPath(points: { x: number, y: number }[]) {
    if (points.length === 0) return ''
    
    let path = `M${points[0].x},${points[0].y}`
    
    for (let i = 1; i < points.length; i++) {
      // Use simpler lines for mobile to improve performance
      if (isMobile) {
        path += ` L${points[i].x},${points[i].y}`
      } else {
        // Use bezier curves for smoother lines on desktop
        const controlX1 = points[i - 1].x + (points[i].x - points[i - 1].x) / 3
        const controlY1 = points[i - 1].y
        const controlX2 = points[i].x - (points[i].x - points[i - 1].x) / 3
        const controlY2 = points[i].y
        
        path += ` C${controlX1},${controlY1} ${controlX2},${controlY2} ${points[i].x},${points[i].y}`
      }
    }
    
    return path
  }
  
  // Handle window resize without state changes
  useEffect(() => {
    function handleResize() {
      // Just trigger a re-render, no state changes that might interrupt animations
      containerRef.current?.classList.add('resized')
      setTimeout(() => {
        containerRef.current?.classList.remove('resized')
      }, 0)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // Set loaded state after component mounts to ensure smooth animation start
  useEffect(() => {
    // Short timeout to ensure browser has finished initial rendering
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, 200)
    
    return () => clearTimeout(timer)
  }, [])
  
  // Use a single SVG clipPath approach for smoother animation
  return (
    <div 
      ref={containerRef}
      className={`absolute ${isMobile ? 'top-32' : isLargeDisplay ? 'top-16' : 'top-56'} left-1/2 transform -translate-x-1/2 w-full max-w-[1400px] h-[700px] z-0 pointer-events-none px-4 sm:px-8 md:px-16 lg:px-24`}
      style={{
        willChange: isLargeDisplay ? 'transform' : 'auto',
        marginTop: isLargeDisplay ? '0' : 'auto'
      }}
    >
      <svg 
        width="100%" 
        height="100%" 
        viewBox="0 0 1400 500"
        preserveAspectRatio="xMidYMid meet"
        className="opacity-70"
      >
        {/* Horizontal grid lines - reduced for mobile */}
        {Array.from({ length: isMobile ? 5 : 10 }).map((_, i) => (
          <line 
            key={`grid-h-${i}`}
            x1="0" 
            y1={i * (isMobile ? 100 : 50)} 
            x2="1400" 
            y2={i * (isMobile ? 100 : 50)} 
            stroke="#4299e1" 
            strokeWidth="0.3" 
            strokeDasharray="5,5" 
            opacity={isMobile ? "0.3" : "0.5"}
          />
        ))}
        
        {/* Vertical grid lines - reduced for mobile */}
        {Array.from({ length: isMobile ? 14 : 28 }).map((_, i) => (
          <line 
            key={`grid-v-${i}`}
            x1={`${i * (isMobile ? 100 : 50)}`} 
            y1="0" 
            x2={`${i * (isMobile ? 100 : 50)}`} 
            y2="500" 
            stroke="#4299e1" 
            strokeWidth="0.3" 
            strokeDasharray="5,5" 
            opacity={isMobile ? "0.3" : "0.5"}
          />
        ))}
        
        {/* Area under the chart - fade in effect */}
        <motion.path
          d={areaPathString}
          fill="url(#gradient)"
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? (isMobile ? 0.3 : 0.5) : 0 }}
          transition={{ duration: isMobile ? 1.5 : 2, ease: "linear" }}
        />
        
        {/* Add clipPath definition for the animation */}
        <defs>
          <clipPath id="chart-reveal-clip">
            <motion.rect
              x="0"
              y="0"
              initial={{ width: 0 }}
              animate={{ width: isLoaded ? 1400 : 0 }}
              transition={{ 
                duration: isMobile ? 2 : 2.5, 
                ease: "easeInOut",
                delay: 0.2
              }}
              width="1400"
              height="500"
            />
          </clipPath>
          
          {/* Gradients */}
          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4299e1" stopOpacity={isMobile ? "0.7" : "0.9"} />
            <stop offset="100%" stopColor="#4299e1" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        
        {/* Single chart line with clipPath for smooth reveal */}
        <g clipPath="url(#chart-reveal-clip)">
          <path
            d={pathString}
            fill="none"
            stroke="#4299e1"
            strokeWidth={isMobile ? "1.5" : "2"}
            strokeLinecap="round"
            style={{
              filter: isMobile ? 
                'drop-shadow(0 0 4px rgba(66, 153, 225, 0.4))' : 
                'drop-shadow(0 0 8px rgba(66, 153, 225, 0.5))'
            }}
          />
          
          {/* Removing dot markers entirely to fix floating dot issue */}
        </g>
      </svg>
    </div>
  )
} 