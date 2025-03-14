import { cn } from "@/lib/utils";
import { motion, useInView } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Mobile dots indicator component for the carousel
export const MobileDotsIndicator = ({ 
  totalSlides, 
  currentSlide 
}: { 
  totalSlides: number; 
  currentSlide: number 
}) => {
  return (
    <div className="flex justify-center gap-2 mt-4 md:hidden">
      {Array.from({ length: totalSlides }).map((_, index) => (
        <div
          key={index}
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            index === currentSlide ? "bg-[#4299e1] w-4" : "bg-gray-600"
          }`}
        />
      ))}
    </div>
  );
};

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const childrenArray = Array.isArray(children) ? children : [children];
  const totalSlides = childrenArray.length;

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

  // Navigation functions for arrow buttons
  const navigateToSlide = (slideIndex: number) => {
    if (!scrollContainerRef.current) return;
    
    // Keep the index within bounds
    const targetIndex = Math.max(0, Math.min(slideIndex, totalSlides - 1));
    
    // Calculate the scroll position
    const container = scrollContainerRef.current;
    const slideWidth = container.offsetWidth * 0.85; // 85% width per slide
    // Adjust for the first slide which is 95% wide
    const scrollPosition = targetIndex === 0 
      ? 0 
      : slideWidth + (targetIndex - 1) * slideWidth;
    
    // Smooth scroll to that position
    container.scrollTo({
      left: scrollPosition,
      behavior: 'smooth'
    });
    
    setCurrentSlide(targetIndex);
  };

  const goToNextSlide = () => {
    navigateToSlide(currentSlide + 1);
  };

  const goToPrevSlide = () => {
    navigateToSlide(currentSlide - 1);
  };

  // Track scroll position to update current slide indicator
  useEffect(() => {
    if (!isMobile || !scrollContainerRef.current) return;

    const scrollContainer = scrollContainerRef.current;
    
    const handleScroll = () => {
      if (!scrollContainer) return;
      
      const slideWidth = scrollContainer.offsetWidth * 0.85; // 85% width per slide
      const scrollPosition = scrollContainer.scrollLeft;
      const newCurrentSlide = Math.round(scrollPosition / slideWidth);
      
      setCurrentSlide(newCurrentSlide);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  // On mobile: horizontal scrollable carousel
  // On desktop: standard grid layout
  return (
    <>
      <div
        ref={scrollContainerRef}
        className={cn(
          isMobile
          ? "flex overflow-x-auto snap-x snap-mandatory py-4 gap-4 scroll-smooth hide-scrollbar"
          : "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto",
          className
        )}
        style={isMobile ? {
          scrollbarWidth: 'none', /* Firefox */
          msOverflowStyle: 'none', /* IE and Edge */
          scrollBehavior: 'smooth'
        } : {}}
      >
        {isMobile 
          ? childrenArray.map((child, index) => (
              <div 
                key={index} 
                className={`snap-center flex-shrink-0 ${index === 0 ? 'w-[95%]' : 'w-[85%]'} first:pl-4 last:pr-4 h-[70vh] max-h-[600px] min-h-[450px]`}
              >
                {child}
              </div>
            ))
          : children
        }
      </div>
      
      {/* Mobile view with arrow navigation - moved to bottom */}
      {isMobile && (
        <div className="relative mt-2 mb-5">
          {/* Left Navigation Arrow */}
          <button 
            onClick={goToPrevSlide}
            className={`absolute left-8 top-0 z-20 bg-black/70 backdrop-blur-sm rounded-full px-5 py-3 text-white border border-white/20 transition-opacity duration-300 ${
              currentSlide === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-90 hover:opacity-100'
            }`}
            disabled={currentSlide === 0}
            aria-label="Previous card"
          >
            <ChevronLeft size={24} />
          </button>
          
          {/* Right Navigation Arrow */}
          <button 
            onClick={goToNextSlide}
            className={`absolute right-8 top-0 z-20 bg-black/70 backdrop-blur-sm rounded-full px-5 py-3 text-white border border-white/20 transition-opacity duration-300 ${
              currentSlide === totalSlides - 1 ? 'opacity-30 cursor-not-allowed' : 'opacity-90 hover:opacity-100'
            }`}
            disabled={currentSlide === totalSlides - 1}
            aria-label="Next card"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      )}
      
      {/* Show dots indicator only on mobile */}
      {isMobile && childrenArray.length > 1 && (
        <MobileDotsIndicator 
          totalSlides={childrenArray.length} 
          currentSlide={currentSlide} 
        />
      )}
    </>
  );
};

// Add a style tag to hide scrollbars on mobile
export const MobileScrollbarStyle = () => (
  <style jsx global>{`
    .hide-scrollbar::-webkit-scrollbar {
      display: none;
    }
  `}</style>
);

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  iconBg,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  iconBg?: string;
}) => {
  const isLarge = className?.includes('md:row-span-2');
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  
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
  
  return (
    <motion.div
      ref={ref}
      className={cn(
        "row-span-1 rounded-xl group/bento transition duration-200 shadow-input dark:shadow-none p-4 sm:p-6 dark:bg-[#0a0a0f]/60 dark:border-white/[0.1] backdrop-blur-sm border border-white/5 justify-between flex flex-col h-full",
        className
      )}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: { 
          opacity: 0,
          y: 20
        },
        visible: { 
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.5,
            ease: "easeOut"
          }
        }
      }}
      whileHover={!isMobile ? {
        y: -5,
        boxShadow: '0 10px 30px -15px rgba(66, 153, 225, 0.2)',
        borderColor: 'rgba(66, 153, 225, 0.3)'
      } : {}}
    >
      {header}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div 
            className={cn(
              "rounded-lg flex items-center justify-center flex-shrink-0",
              isLarge ? 'w-14 h-14' : 'w-12 h-12',
              iconBg || 'bg-[#4299e1]/10'
            )}
          >
            {icon}
          </div>
          <div className={cn(
            "font-bold text-white",
            isLarge ? 'text-2xl' : 'text-xl'
          )}>
            {title}
          </div>
        </div>
        <div className={cn(
          "font-normal text-slate-400",
          isLarge ? 'text-base leading-relaxed' : 'text-sm leading-relaxed'
        )}>
          {description}
        </div>
      </div>
    </motion.div>
  );
};