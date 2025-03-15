'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Check } from 'lucide-react'
import { plans } from 'data/pricing'

// Custom CSS for hide-scrollbar
const styles = {
  hideScrollbar: `
    .hide-scrollbar {
      -ms-overflow-style: none;  /* IE and Edge */
      scrollbar-width: none;     /* Firefox */
    }
    .hide-scrollbar::-webkit-scrollbar {
      display: none;             /* Chrome, Safari and Opera */
    }
  `
};

// Simple canvas-based particle background
const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Update the type definition to include all properties
  type Particle = {
    x: number;
    y: number;
    radius: number;
    speedX: number;
    speedY: number;
    color: string;
    originalX: number;
    originalY: number;
    wobbleSpeed: number;
    wobbleFactor: number;
    wobbleOffset: number;
  };
  
  const particlesRef = useRef<Particle[]>([]);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>(0);
  const isMobileRef = useRef<boolean>(false);

  // Calculate responsive particle count and adjust properties based on screen size
  const getResponsiveParticleSettings = useCallback(() => {
    const isMobile = window.innerWidth < 768;
    isMobileRef.current = isMobile;
    
    // Adjust particle count based on screen size
    const baseCount = isMobile ? 80 : 120;
    
    // Adjust wobble and speed factors for different screen sizes
    const speedFactor = isMobile ? 0.3 : 0.5;
    const wobbleSpeedBase = isMobile ? 0.04 : 0.05;
    const wobbleFactorBase = isMobile ? 2 : 3;
    
    return {
      count: baseCount,
      speedFactor,
      wobbleSpeedBase,
      wobbleFactorBase
    };
  }, []);

  // Initialize particles
  const initParticles = useCallback(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Get display dimensions rather than canvas dimensions
    // This ensures we're working with the visible area
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Get responsive settings
    const { count, speedFactor, wobbleSpeedBase, wobbleFactorBase } = getResponsiveParticleSettings();
    
    // Array of blue colors for variety
    const blueColors = [
      '#4299e1', // Base blue
      '#3182ce', // Darker blue
      '#63b3ed', // Lighter blue
      '#90cdf4', // Very light blue
      '#2b6cb0'  // Deep blue
    ];
    
    // Create particles with minimal speed for a suspended effect
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2 + 0.8,
      speedX: (Math.random() - 0.5) * speedFactor,
      speedY: (Math.random() - 0.5) * speedFactor,
      color: blueColors[Math.floor(Math.random() * blueColors.length)],
      originalX: 0,
      originalY: 0,
      wobbleSpeed: Math.random() * wobbleSpeedBase + 0.03,
      wobbleFactor: Math.random() * wobbleFactorBase + wobbleFactorBase,
      wobbleOffset: Math.random() * Math.PI * 2, // Random starting point in the sin wave
    }));
    
    // Store original positions for the subtle floating effect
    particlesRef.current.forEach(particle => {
      particle.originalX = particle.x;
      particle.originalY = particle.y;
    });
    
    setIsInitialized(true);
  }, [getResponsiveParticleSettings]);

  // Setup canvas and initial dimensions
  useEffect(() => {
    const setupCanvas = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const parent = canvas.parentElement;
      
      if (parent) {
        // Use device pixel ratio for sharp rendering on high-DPI screens
        const dpr = window.devicePixelRatio || 1;
        
        // Set dimensions based on parent element
        const displayWidth = parent.clientWidth;
        const displayHeight = parent.clientHeight;
        
        // Set the canvas size
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        
        // Set CSS dimensions separately from canvas dimensions
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        
        // Scale the drawing context by the device pixel ratio
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
        
        // Update dimensions state
        setDimensions({
          width: displayWidth,
          height: displayHeight
        });
        
        // Initialize particles
        initParticles();
      }
    };

    // Run setup on mount with a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      setupCanvas();
    }, 50);
    
    return () => clearTimeout(timer);
  }, [initParticles]);

  // Handle resize
  useEffect(() => {
    if (!isInitialized) return;

    const handleResize = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const parent = canvas.parentElement;
      
      if (parent) {
        // Use device pixel ratio for sharp rendering on high-DPI screens
        const dpr = window.devicePixelRatio || 1;
        
        // Get the new dimensions
        const newWidth = parent.clientWidth;
        const newHeight = parent.clientHeight;
        
        // Update canvas dimensions
        canvas.width = newWidth * dpr;
        canvas.height = newHeight * dpr;
        
        // Set CSS dimensions
        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;
        
        // Scale the context
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
        
        // Check if we've changed between mobile/desktop
        const wasMobile = isMobileRef.current;
        const isMobileNow = window.innerWidth < 768;
        
        // Update dimensions state
        setDimensions({
          width: newWidth,
          height: newHeight
        });
        
        if (wasMobile !== isMobileNow || particlesRef.current.length === 0) {
          // Reinitialize particles on mobile/desktop switch
          initParticles();
        } else {
          // Just reposition existing particles to fit new dimensions
          repositionParticles(newWidth, newHeight);
        }
      }
    };
    
    // Helper to reposition particles when canvas size changes
    const repositionParticles = (newWidth: number, newHeight: number) => {
      if (particlesRef.current.length === 0) return;
      
      particlesRef.current.forEach(particle => {
        // Keep relative position but scale to new canvas size
        particle.originalX = (particle.originalX / dimensions.width) * newWidth;
        particle.originalY = (particle.originalY / dimensions.height) * newHeight;
        particle.x = particle.originalX;
        particle.y = particle.originalY;
      });
    };

    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    // Track mouse position
    const handleMouseMove = (e: MouseEvent) => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        mousePositionRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }
    };
    
    // Handle touch events for mobile
    const handleTouchMove = (e: TouchEvent) => {
      if (canvasRef.current && e.touches.length > 0) {
        const rect = canvasRef.current.getBoundingClientRect();
        mousePositionRef.current = {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top
        };
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleTouchMove);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [dimensions.width, dimensions.height, initParticles, isInitialized]);

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || !isInitialized) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationTime = 0;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let mouseSpeedX = 0;
    let mouseSpeedY = 0;
    
    const animate = () => {
      if (!ctx || !canvas) return;
      
      // Get the correct dimensions for clearing (accounting for device pixel ratio)
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;
      
      animationTime += 0.025; // Animation speed
      
      // Calculate mouse movement speed/direction
      const currentMouseX = mousePositionRef.current.x;
      const currentMouseY = mousePositionRef.current.y;
      mouseSpeedX = currentMouseX - prevMouseX;
      mouseSpeedY = currentMouseY - prevMouseY;
      prevMouseX = currentMouseX;
      prevMouseY = currentMouseY;
      
      // Clear canvas with display dimensions (not canvas dimensions which include DPR)
      ctx.clearRect(0, 0, displayWidth, displayHeight);
      
      // Update and draw particles
      particlesRef.current.forEach(particle => {
        // Store the original wobble position for elastic reference
        const baseWobbleX = Math.sin(animationTime * particle.wobbleSpeed + particle.wobbleOffset) * particle.wobbleFactor;
        const baseWobbleY = Math.cos(animationTime * particle.wobbleSpeed * 1.5 + particle.wobbleOffset) * (particle.wobbleFactor * 0.8);
        
        // Calculate the base position without cursor influence
        const baseX = particle.originalX + baseWobbleX;
        const baseY = particle.originalY + baseWobbleY;
        
        // Get distance to cursor for attraction calculation
        const mouseX = mousePositionRef.current.x;
        const mouseY = mousePositionRef.current.y;
        const dx = mouseX - baseX;
        const dy = mouseY - baseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Apply elastic attraction - particles get pulled toward cursor 
        // but maintain connection to their original position
        let cursorInfluenceX = 0;
        let cursorInfluenceY = 0;
        
        if (distance < 200) { // Interaction radius
          // Calculate elastic pull factor - closer means stronger pull but never 100%
          const elasticFactor = Math.min(0.4, (1 - distance / 200) * 0.6); // Max 40% pull
          
          // Direction to cursor
          const angle = Math.atan2(dy, dx);
          
          // Apply elastic pull toward cursor
          cursorInfluenceX = Math.cos(angle) * elasticFactor * distance * 0.15;
          cursorInfluenceY = Math.sin(angle) * elasticFactor * distance * 0.15;
          
          // Apply small directional nudge based on cursor movement
          if (Math.abs(mouseSpeedX) > 1 || Math.abs(mouseSpeedY) > 1) {
            const mouseSpeed = Math.sqrt(mouseSpeedX * mouseSpeedX + mouseSpeedY * mouseSpeedY);
            const nudgeFactor = Math.min(0.1, mouseSpeed / 50) * (1 - distance / 200);
            
            cursorInfluenceX += mouseSpeedX * nudgeFactor;
            cursorInfluenceY += mouseSpeedY * nudgeFactor;
          }
        }
        
        // Final position combines base position with cursor influence
        particle.x = baseX + cursorInfluenceX;
        particle.y = baseY + cursorInfluenceY;
        
        // Normal movement updates for the base position
        particle.originalX += particle.speedX * 1.2;
        particle.originalY += particle.speedY * 1.2;
        
        // Keep particles within bounds with more energetic bouncing
        if (particle.originalX < 0 || particle.originalX > displayWidth) {
          particle.speedX *= -1;
          particle.originalX += particle.speedX * 5; // More energetic bounce
        }
        
        if (particle.originalY < 0 || particle.originalY > displayHeight) {
          particle.speedY *= -1;
          particle.originalY += particle.speedY * 5; // More energetic bounce
        }
        
        // Draw particle with subtle size variance based on movement
        const movementIntensity = Math.abs(baseWobbleX) + Math.abs(baseWobbleY);
        const sizeVariance = 1 + (movementIntensity / 30);
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius * sizeVariance, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();
      });
      
      // Continue animation
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isInitialized]);

  return (
    <canvas
      ref={canvasRef}
      style={{ 
        display: 'block', 
        width: '100%', 
        height: '100%',
        pointerEvents: 'auto' // Allow mouse interaction with the canvas
      }}
    />
  );
};

export default function PricingPage() {
  const mainContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  
  // Handle scroll events in the pricing cards container
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const cardWidth = container.scrollWidth / plans.length;
    
    // Calculate which card is most visible
    const newActiveIndex = Math.round(scrollLeft / cardWidth);
    
    if (newActiveIndex !== activePlanIndex) {
      setActivePlanIndex(newActiveIndex);
    }
  }, [activePlanIndex]);
  
  // Scroll to a specific card when pagination indicator is clicked
  const scrollToCard = (index: number) => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const cardWidth = container.scrollWidth / plans.length;
    
    container.scrollTo({
      left: index * cardWidth,
      behavior: 'smooth'
    });
    
    setActivePlanIndex(index);
  };
  
  // Add scroll event listener to the container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);
  
  // Update content height when component mounts and on resize
  useEffect(() => {
    const updateContentHeight = () => {
      if (mainContentRef.current) {
        // Get height of just the main content area, not including footer
        // Adjust this to exclude the height of the original footer
        setContentHeight(mainContentRef.current.offsetHeight);
      }
    };
    
    // Initial measurement
    updateContentHeight();
    
    // Add event listener for window resize
    window.addEventListener('resize', updateContentHeight);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', updateContentHeight);
    };
  }, []);
  
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-black/50 to-[#0a0a0f]/50">
      {/* Apply custom CSS */}
      <style dangerouslySetInnerHTML={{ __html: styles.hideScrollbar }} />
      
      {/* Particle background with restricted height - only covers main content */}
      <div style={{ 
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: contentHeight || '100vh', // Restrict to content height or full viewport if not measured yet
        overflow: 'hidden',
        zIndex: 0
      }}>
      <ParticleBackground />
      </div>
      
      <main ref={mainContentRef} className="relative z-10 pt-20 pb-32">
        {/* Header */}
        <div className="text-center mb-16 sm:mb-20 md:mb-32 px-4 sm:px-6 md:px-0">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white mb-4 max-w-xs sm:max-w-none mx-auto">
            Simple, transparent pricing
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-xs sm:max-w-lg md:max-w-2xl mx-auto">
            Choose the perfect plan for your investment needs
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Desktop layout - unchanged */}
          <div className="hidden md:grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col bg-white/5 backdrop-blur-lg rounded-xl overflow-hidden
                  transform transition-all duration-300 ease-in-out hover:scale-105 hover:z-10
                  hover:shadow-[0_0_30px_rgba(66,153,225,0.3)]
                  shadow-[0_4px_20px_rgba(0,0,0,0.2)]
                  ${plan.name === 'Plus' ? 
                    'border-2 border-[#4299e1] md:-my-8 shadow-[0_0_25px_rgba(66,153,225,0.2)]' : 
                    'border border-white/10 hover:border-[#4299e1]/50'}`}
              >
                {plan.nameBadge && (
                  <div className="absolute top-4 right-4 bg-[#4299e1] text-white text-sm px-3 py-1 rounded-full">
                    {plan.name === 'Plus' ? 'Recommended' : plan.nameBadge}
                  </div>
                )}

                <div className="p-8">
                  <h3 className="text-2xl font-semibold text-white mb-2">{plan.name}</h3>
                  <p className="text-slate-300 mb-6">{plan.description}</p>
                  
                  <div className="flex items-baseline mb-8">
                    {plan.priceMonthly !== '0' && (
                      <span className="text-4xl font-bold text-white">$</span>
                    )}
                    <span className="text-5xl font-bold text-white">
                      {plan.priceMonthly === '0' ? '$0' : plan.priceMonthly}
                    </span>
                    {(
                      <span className="ml-2 text-slate-300">{plan.costUnit}</span>
                    )}
                  </div>

                  <button
                    className={`w-full py-3 px-6 rounded-lg font-semibold transition-all duration-200
                      transform hover:scale-[1.02] active:scale-[0.98]
                      ${plan.name === 'Plus'
                        ? 'bg-[#4299e1] text-white hover:bg-[#63b3ff]'
                        : 'bg-white/10 text-white hover:bg-white/20'}`}
                    onClick={() => {
                      // Trigger the ContactSlideout to open
                      const event = new CustomEvent('openWaitlistSlideout');
                      window.dispatchEvent(event);
                    }}
                  >
                    Join Waitlist
                  </button>
                </div>

                <div className="p-8 border-t border-white/10 flex-1">
                  <h4 className="text-white font-medium mb-4">Included in this plan:</h4>
                  <ul className="space-y-4">
                    {plan.features.map((feature) => (
                      <li key={typeof feature === 'string' ? feature : feature[0]} className="flex">
                        <Check className="h-6 w-6 text-[#4299e1] flex-shrink-0" />
                        <div className="ml-3">
                          <p className="text-white">
                            {typeof feature === 'string' ? feature : feature[0]}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile layout - horizontal scrollable */}
          <div className="md:hidden">
            {/* Swipe indicator text */}
            <div className="text-center mb-4 text-slate-400 text-sm">
              <span>← Swipe to compare plans →</span>
            </div>
            
            {/* Horizontal scrollable container */}
            <div 
              ref={scrollContainerRef}
              className="flex overflow-x-auto pb-8 snap-x snap-mandatory hide-scrollbar"
            >
              {plans.map((plan, index) => (
                <div
                  key={plan.name}
                  className={`relative flex-shrink-0 w-[85%] mx-2 first:ml-4 last:mr-4
                    snap-center flex flex-col bg-white/5 backdrop-blur-lg rounded-xl overflow-hidden
                    transform transition-all duration-300 ease-in-out
                    shadow-[0_4px_20px_rgba(0,0,0,0.2)]
                    ${plan.name === 'Plus' ? 
                      'border-2 border-[#4299e1] shadow-[0_0_25px_rgba(66,153,225,0.2)]' : 
                      'border border-white/10'}`}
                >
                  {plan.nameBadge && (
                    <div className="absolute top-4 right-4 bg-[#4299e1] text-white text-sm px-3 py-1 rounded-full">
                      {plan.name === 'Plus' ? 'Recommended' : plan.nameBadge}
                    </div>
                  )}

                  <div className="p-6">
                    <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                    <p className="text-slate-300 text-sm mb-4">{plan.description}</p>
                    
                    <div className="flex items-baseline mb-6">
                      {plan.priceMonthly !== '0' && (
                        <span className="text-3xl font-bold text-white">$</span>
                      )}
                      <span className="text-4xl font-bold text-white">
                        {plan.priceMonthly === '0' ? '$0' : plan.priceMonthly}
                      </span>
                      {(
                        <span className="ml-2 text-slate-300 text-sm">{plan.costUnit}</span>
                      )}
                    </div>

                    <button
                      className={`w-full py-3 px-6 rounded-lg font-semibold transition-all duration-200
                        active:scale-[0.98]
                        ${plan.name === 'Plus'
                          ? 'bg-[#4299e1] text-white'
                          : 'bg-white/10 text-white'}`}
                      onClick={() => {
                        // Trigger the ContactSlideout to open
                        const event = new CustomEvent('openWaitlistSlideout');
                        window.dispatchEvent(event);
                      }}
                    >
                      Join Waitlist
                    </button>
                  </div>

                  <div className="p-6 border-t border-white/10 flex-1">
                    <h4 className="text-white font-medium mb-3 text-sm">Included in this plan:</h4>
                    <ul className="space-y-3">
                      {plan.features.map((feature) => (
                        <li key={typeof feature === 'string' ? feature : feature[0]} className="flex">
                          <Check className="h-5 w-5 text-[#4299e1] flex-shrink-0" />
                          <div className="ml-2">
                            <p className="text-white text-sm">
                              {typeof feature === 'string' ? feature : feature[0]}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pagination indicators */}
            <div className="flex justify-center mt-4 space-x-2">
              {plans.map((plan, index) => (
                <div 
                  key={`indicator-${index}`}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer
                    ${index === activePlanIndex ? 'w-6 bg-[#4299e1]' : 'w-2 bg-[#4299e1]/30'}`}
                  onClick={() => scrollToCard(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
      
      {/* No footer here - we're using the layout footer */}
    </div>
  )
} 