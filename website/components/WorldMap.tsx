"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "lib/utils";
import { motion } from "framer-motion";
import DottedMap from "dotted-map";
import { useTheme } from "next-themes";
import Image from "next/image";

// Connection points data (similar to the previous NEWS_CONNECTIONS)
const CONNECTIONS = [
  {
    id: 1,
    startLat: 40.7128,
    startLng: -74.006,
    endLat: 34.0522,
    endLng: -118.2437,
    color: "#FFEB3B"
  },
  {
    id: 2,
    startLat: 51.5074,
    startLng: -0.1278,
    endLat: 48.8566,
    endLng: 2.3522,
    color: "#FF9800"
  },
  {
    id: 3,
    startLat: 35.6762,
    startLng: 139.6503,
    endLat: 22.3193,
    endLng: 114.1694,
    color: "#4CAF50"
  },
  {
    id: 4,
    startLat: -33.8688,
    startLng: 151.2093,
    endLat: 1.3521,
    endLng: 103.8198,
    color: "#2196F3"
  },
  {
    id: 5,
    startLat: 19.4326,
    startLng: -99.1332,
    endLat: -34.6037,
    endLng: -58.3816,
    color: "#F44336"
  },
  {
    id: 6,
    startLat: 55.7558,
    startLng: 37.6173,
    endLat: 28.6139,
    endLng: 77.2090,
    color: "#9C27B0"
  }
];

// Helper function to generate a random number between min and max
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

// Point data type
interface Point {
  x: number;
  y: number;
  geoPosition: {
    lat: number;
    lng: number;
  };
}

// Connection data type
interface Connection {
  id: number;
  startPoint: Point;
  endPoint: Point;
  color: string;
}

interface WorldMapProps {
  className?: string;
  highlightColor?: string;
  baseColor?: string;
  backgroundColor?: string;
  dotSize?: number;
  dotColor?: string;
  highlightedDotColor?: string;
  isMobile?: boolean;
}

export function WorldMap({
  className,
  highlightColor = "#ffeb3b",
  baseColor = "#353D69", 
  backgroundColor = "#0a0a15",
  dotSize = 0.4,
  dotColor = "#ffffff",
  highlightedDotColor = "#ffeb3b",
  isMobile = false,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [mapSvg, setMapSvg] = useState<string>("");
  const [activeConnection, setActiveConnection] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { theme } = useTheme() || { theme: 'dark' };

  // Adjust the scale and size based on mobile or desktop
  const adjustedDotSize = isMobile ? dotSize * 0.8 : dotSize;
  
  // Choose the grid pattern based on mobile or desktop
  const gridPattern = isMobile ? 'vertical' : 'diagonal';

  // Function to project geographical coordinates to pixel coordinates
  const projectPoint = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  // Function to create curved path between two points
  const createCurvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const midX = (start.x + end.x) / 2;
    const midY = Math.min(start.y, end.y) - 20;
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  };

  // Initialize the map
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMounted(true);

    try {
      // Create a DottedMap with proper configuration
      const map = new DottedMap({ height: 50, grid: gridPattern });

      // Add all connection points to the map
      CONNECTIONS.forEach(conn => {
        // Add start point
        map.addPin({
          lat: conn.startLat,
          lng: conn.startLng,
          svgOptions: { color: dotColor, radius: adjustedDotSize }
        });

        // Add end point
        map.addPin({
          lat: conn.endLat,
          lng: conn.endLng,
          svgOptions: { color: dotColor, radius: adjustedDotSize }
        });
      });

      // Get SVG representation
      const svgMap = map.getSVG({
        radius: adjustedDotSize,
        color: dotColor,
        shape: 'circle',
        backgroundColor: backgroundColor
      });

      setMapSvg(svgMap);

      // Set an interval to change the active connection periodically
      const interval = setInterval(() => {
        setActiveConnection((prev) => {
          if (prev === null) return 1;
          return prev >= CONNECTIONS.length ? 1 : prev + 1;
        });
      }, 3000);

      return () => clearInterval(interval);
    } catch (err) {
      console.error("Error initializing map:", err);
    }
  }, [adjustedDotSize, gridPattern, backgroundColor, dotColor, isMobile]);

  if (!isMounted) return null;

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "relative w-full h-full overflow-hidden rounded-lg",
        className
      )}
    >
      {/* Background Map */}
      <div className="w-full h-full absolute inset-0">
        <Image
          src={`data:image/svg+xml;utf8,${encodeURIComponent(mapSvg)}`}
          alt="World Map"
          layout="fill"
          objectFit="cover"
          className="opacity-80"
        />
      </div>
      
      {/* Connections */}
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        className="w-full h-full absolute inset-0 pointer-events-none"
      >
        {CONNECTIONS.map((connection, i) => {
          const startPoint = projectPoint(connection.startLat, connection.startLng);
          const endPoint = projectPoint(connection.endLat, connection.endLng);
          const isActive = activeConnection === connection.id;
          
          return (
            <g key={`connection-${i}`}>
              {/* Connection line */}
              <motion.path
                d={createCurvedPath(startPoint, endPoint)}
                stroke={isActive ? highlightColor : connection.color}
                strokeWidth={isActive ? 2 : 1}
                fill="none"
                opacity={isActive ? 0.9 : 0.5}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: 1.5,
                  ease: "easeOut"
                }}
              />
              
              {/* Start point */}
              <g>
                <circle
                  cx={startPoint.x}
                  cy={startPoint.y}
                  r={isActive ? adjustedDotSize * 3 : adjustedDotSize * 2}
                  fill={isActive ? highlightedDotColor : connection.color}
                />
                
                {isActive && (
                  <circle
                    cx={startPoint.x}
                    cy={startPoint.y}
                    r={adjustedDotSize * 2}
                    fill={isActive ? highlightedDotColor : connection.color}
                    opacity="0.5"
                  >
                    <animate
                      attributeName="r"
                      from={adjustedDotSize * 2}
                      to={adjustedDotSize * 6}
                      dur="1.5s"
                      begin="0s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.5"
                      to="0"
                      dur="1.5s"
                      begin="0s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
              
              {/* End point */}
              <g>
                <circle
                  cx={endPoint.x}
                  cy={endPoint.y}
                  r={isActive ? adjustedDotSize * 3 : adjustedDotSize * 2}
                  fill={isActive ? highlightedDotColor : connection.color}
                />
                
                {isActive && (
                  <circle
                    cx={endPoint.x}
                    cy={endPoint.y}
                    r={adjustedDotSize * 2}
                    fill={isActive ? highlightedDotColor : connection.color}
                    opacity="0.5"
                  >
                    <animate
                      attributeName="r"
                      from={adjustedDotSize * 2}
                      to={adjustedDotSize * 6}
                      dur="1.5s"
                      begin="0s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.5"
                      to="0"
                      dur="1.5s"
                      begin="0s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Export the component as default
export default WorldMap;
