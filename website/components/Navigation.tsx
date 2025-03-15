'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from './ui/button'
import Logo from './Logo'
import ContactSlideout from './ContactSlideout'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronRight } from 'lucide-react'

export default function Navigation() {
  const pathname = usePathname()
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [hasScrolled, setHasScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLargeDisplay, setIsLargeDisplay] = useState(false)

  // Add scroll event listener
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY
      if (scrollPosition > 10) {
        setHasScrolled(true)
      } else {
        setHasScrolled(false)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Check for large display
  useEffect(() => {
    const checkIsLargeDisplay = () => {
      setIsLargeDisplay(window.innerWidth > 1920)
    }
    
    // Check on mount and when window resizes
    checkIsLargeDisplay()
    window.addEventListener('resize', checkIsLargeDisplay)
    
    return () => window.removeEventListener('resize', checkIsLargeDisplay)
  }, [])

  // Special handling for scroll events on large displays
  useEffect(() => {
    if (!isLargeDisplay) return
    
    // Create a reference to the nav element
    let navElement: HTMLElement | null = null;
    
    const handleScroll = () => {
      if (!navElement) {
        // Find the nav element on first scroll
        navElement = document.querySelector('nav');
      }
      
      if (navElement) {
        // Ensure consistent height on large displays
        if (window.scrollY === 0) {
          // At top - ensure clean layout
          navElement.style.height = '60px';
          navElement.style.minHeight = '60px';
        }
      }
    }
    
    // Apply initially
    setTimeout(handleScroll, 0);
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLargeDisplay]);

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  // Listen for custom event to open waitlist slideout
  useEffect(() => {
    const handleOpenWaitlist = () => {
      setIsContactOpen(true)
    }

    window.addEventListener('openWaitlistSlideout', handleOpenWaitlist)
    return () => window.removeEventListener('openWaitlistSlideout', handleOpenWaitlist)
  }, [])

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false)
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.classList.add('overflow-hidden')
    } else {
      document.body.classList.remove('overflow-hidden')
    }
    return () => {
      document.body.classList.remove('overflow-hidden')
    }
  }, [isMobileMenuOpen])

  const isActive = (path: string) => {
    return pathname === path ? 
      "text-[#4299e1] font-medium text-sm" : 
      "text-slate-200 hover:text-[#4299e1] transition-colors text-sm"
  }

  const mobileNavVariants = {
    closed: {
      opacity: 0,
      x: '100%',
      transition: {
        duration: 0.3,
        ease: 'easeInOut'
      }
    },
    open: {
      opacity: 1,
      x: '0%',
      transition: {
        duration: 0.3,
        ease: 'easeInOut'
      }
    }
  }

  return (
    <>
      <nav className={`${
          hasScrolled || pathname !== "/" || isLargeDisplay
            ? "bg-black py-2"
            : "bg-black py-4"
        } sticky top-0 z-50 transition-all duration-300 ${isLargeDisplay ? 'py-3 border-b border-gray-900' : ''}`}>
        {/* This div controls the width constraints and centers the content, matching main page */}
        <div className="mx-auto" style={{ maxWidth: "84rem" }}>
          {/* This div aligns with the vertical lines from the page layout */}
          <div className="mx-auto flex justify-between items-center px-6 sm:px-8 md:px-12 lg:px-16">
            <Link href="/" className="flex items-center">
              <Logo className="my-1" />
            </Link>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              <Link 
                href="/" 
                className={isActive('/')}
              >
                Ask Clera
              </Link>
              <Link 
                href="/pricing" 
                className={isActive('/pricing')}
              >
                Pricing
              </Link>
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#4299e1]/40 to-[#4299e1]/40 rounded-lg blur opacity-0 group-hover:opacity-60 transition duration-300"></div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    variant="outline" 
                    onClick={() => setIsContactOpen(true)}
                    className={`relative px-4 py-1 text-sm transition-all duration-300 ease-in-out transform group-hover:scale-102
                      ${isContactOpen 
                        ? 'bg-[#4299e1] text-white border-[#4299e1]' 
                        : 'bg-transparent border-[#4299e1] text-[#4299e1] hover:text-white hover:bg-[#4299e1]'
                      }`}
                  >
                    Join Waitlist
                  </Button>
                </motion.div>
              </div>
            </div>
            
            {/* Mobile Navigation Toggle */}
            <div className="md:hidden">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-10 h-10 flex items-center justify-center text-white focus:outline-none"
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? (
                  <X size={24} className="text-white" />
                ) : (
                  <Menu size={24} className="text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              className="fixed inset-0 bg-black/70 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
            />
            
            {/* Slide-out Menu */}
            <motion.div 
              className="fixed right-0 top-0 bottom-0 w-[75%] max-w-[300px] bg-gradient-to-b from-[#111] to-black border-l border-gray-800 z-50 md:hidden overflow-y-auto"
              variants={mobileNavVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <div className="p-6 h-full flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <div className="w-[85px]"></div>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-10 h-10 flex items-center justify-center text-white focus:outline-none"
                    aria-label="Close menu"
                  >
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>
                
                {/* Mobile Menu Links */}
                <div className="flex flex-col space-y-5">
                  <Link 
                    href="/" 
                    className={`flex items-center justify-between text-base ${pathname === '/' ? 'text-[#4299e1] font-medium' : 'text-white'} py-2`}
                  >
                    <span>Ask Clera</span>
                    <ChevronRight size={16} className={pathname === '/' ? 'text-[#4299e1]' : 'text-gray-400'} />
                  </Link>
                  <Link 
                    href="/pricing" 
                    className={`flex items-center justify-between text-base ${pathname === '/pricing' ? 'text-[#4299e1] font-medium' : 'text-white'} py-2`}
                  >
                    <span>Pricing</span>
                    <ChevronRight size={16} className={pathname === '/pricing' ? 'text-[#4299e1]' : 'text-gray-400'} />
                  </Link>
                  <div className="border-t border-gray-800 my-2"></div>
                </div>
                
                {/* Mobile CTA */}
                <div className="mt-auto pb-6">
                  <Button 
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      setIsContactOpen(true)
                    }}
                    className="w-full bg-[#4299e1] hover:bg-[#4299e1]/90 text-white py-3 rounded-lg flex items-center justify-center space-x-2"
                  >
                    <span>Join Waitlist</span>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ContactSlideout 
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
      />
    </>
  )
} 