'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from './ui/button'
import { HoverBorderGradient } from './ui/hover-border-gradient'
import supabase from '../lib/supabase'
import confetti from 'canvas-confetti'

// Define the structure of our waitlist entry
interface WaitlistEntry {
  name: string
  email: string
  created_at?: string // Optional as Supabase can add this automatically
}

interface ContactSlideoutProps {
  isOpen: boolean
  onClose: () => void
}

export default function ContactSlideout({ isOpen, onClose }: ContactSlideoutProps) {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  
  const triggerConfetti = () => {
    // First burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#4299e1', '#63b3ff', '#fff'],
    })

    // Second burst with slight delay
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#4299e1', '#63b3ff', '#fff'],
      })
    }, 200)
  }
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prevent multiple submissions
    if (status === 'loading') return
    
    setStatus('loading')
    setErrorMessage('')
    
    try {
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Waitlist signup:', { name, email })
      }
      
      // Create a properly typed entry object
      const waitlistEntry: WaitlistEntry = {
        name,
        email
      }
      
      // Insert data into Supabase waitlist table
      const { data, error } = await supabase
        .from('waitlist')
        .insert(waitlistEntry)
      
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Supabase response:', { data, error })
      }
      
      // Check for errors specifically 
      if (error) {
        // Error logging is fine to keep for production
        console.error('Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        
        // Handle common errors
        if (error.code === '23505') {
          throw new Error('This email is already on our waitlist.')
        } else if (error.code === '42P01') {
          throw new Error('Waitlist table not found. Please contact support.')
        } else if (error.code === '42703') {
          throw new Error('Invalid column in waitlist table. Please contact support.')
        } else if (error.code === '23503') {
          throw new Error('Database constraint violation. Please contact support.')
        } else if (error.code?.includes('PGRST')) {
          throw new Error('Access denied. Database permissions need to be updated.')
        } else {
          throw error
        }
      }
      
      // If we get here, the submission was successful
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Successfully added to waitlist:', data)
      }
      triggerConfetti()
      setIsSubmitted(true)
      setStatus('success')
      
      // Reset form after 5 seconds and close the slideout
      setTimeout(() => {
        setIsSubmitted(false)
        setName('')
        setEmail('')
        onClose()
      }, 5000)
    } catch (error: any) {
      console.error('Error submitting to waitlist:', error)
      setStatus('error')
      setErrorMessage(error.message || 'Something went wrong. Please try again.')
      // Still show as submitted but with error message
      setIsSubmitted(false)
    }
  }
  
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])
  
  // Focus trap
  useEffect(() => {
    if (isOpen && formRef.current) {
      const focusableElements = formRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      
      if (focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus()
      }
    }
  }, [isOpen])
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-50"
            onClick={onClose}
          />
          
          {/* Slideout panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[450px] bg-gradient-to-br from-[#0a0a0f] via-[#131320] to-[#1a1a2e] border-l border-white/5 shadow-xl z-50 overflow-auto"
          >
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]"></div>
            <div className="p-8 md:p-10 h-full flex flex-col relative">
              <div className="flex justify-between items-center mb-8">
                <div className="relative">
                  <h2 className="text-2xl font-bold text-white">Join Our Waitlist</h2>
                  <motion.div 
                    className="absolute h-[2px] bg-[#4299e1] bottom-[-8px] left-0"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ 
                      duration: 0.8, 
                      ease: "easeOut",
                      delay: 0.2
                    }}
                  />
                </div>
                <button 
                  onClick={onClose}
                  className="text-slate-400 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X size={24} />
                </button>
              </div>
              
              <AnimatePresence mode="wait">
                {!isSubmitted ? (
                  <motion.form 
                    ref={formRef}
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col flex-grow"
                    onSubmit={handleSubmit}
                  >
                    <p className="text-slate-300 mb-8">
                      Be among the first to experience Clera, our AI-powered financial advisor. 
                      Sign up below for exclusive early access.
                    </p>
                    
                    <div className="mb-6">
                      <label htmlFor="name" className="block text-sm font-medium text-slate-200 mb-2">
                        Your Name
                      </label>
                      <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 bg-[#1a1a24] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4299e1] focus:border-transparent text-white"
                        placeholder="John Doe"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    
                    <div className="mb-10">
                      <label htmlFor="email" className="block text-sm font-medium text-slate-200 mb-2">
                        Email Address
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-[#1a1a24] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4299e1] focus:border-transparent text-white"
                        placeholder="your@email.com"
                        required
                        disabled={status === 'loading'}
                      />
                    </div>
                    
                    {status === 'error' && (
                      <div className="mb-4">
                        <p className="text-red-400 text-sm">
                          {errorMessage || 'Something went wrong. Please try again.'}
                        </p>
                      </div>
                    )}
                    
                    <div className="mt-auto">
                      <HoverBorderGradient
                        as="button"
                        type="submit"
                        containerClassName="w-full rounded-xl"
                        className={`w-full text-white font-medium py-2 rounded-xl ${status === 'loading' ? 'opacity-70' : ''}`}
                        duration={2}
                        clockwise={true}
                        {...(status === 'loading' ? { 'aria-disabled': 'true' } : {})}
                      >
                        {status === 'loading' ? (
                          <div className="flex items-center justify-center space-x-2">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Submitting...</span>
                          </div>
                        ) : (
                          'Submit'
                        )}
                      </HoverBorderGradient>
                    </div>
                  </motion.form>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center flex-grow text-center"
                  >
                    <div className="bg-[#4299e1]/10 rounded-full p-6 mb-6">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="#4299e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">You're on the list!</h3>
                    <p className="text-slate-300 mb-8">
                      Thanks for joining our waitlist. We'll notify you as soon as early access is available.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
} 