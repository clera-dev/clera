'use client'

import { useState } from 'react'
import confetti from 'canvas-confetti'
import supabase from '../lib/supabase'

// Define the structure of our waitlist entry
interface WaitlistEntry {
  name: string
  email: string
}

export default function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

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

    // Third burst
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#4299e1', '#63b3ff', '#fff'],
      })
    }, 400)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Submitting to Supabase:', { name, email })
      }
      
      // Create a properly typed entry object
      const waitlistEntry: WaitlistEntry = {
        name,
        email
      }
      
      // Insert data into Supabase waitlist table with better error handling
      // Note: We don't use .select() here as it might not be needed for inserts
      // and could cause issues with RLS policies
      const { data, error } = await supabase
        .from('waitlist')
        .insert([waitlistEntry])
      
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
      setStatus('success')
      setName('')
      setEmail('')
    } catch (error: any) {
      console.error('Error submitting to waitlist:', error)
      setStatus('error')
      setErrorMessage(error.message || 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="group bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-lg p-6
      transition-all duration-500 ease-in-out
      hover:from-[#4299e1]/20 hover:to-[#63b3ff]/10 hover:scale-[1.02] 
      hover:shadow-[0_0_30px_rgba(66,153,225,0.2)]
      transform">
      <h3 className="text-xl text-white font-semibold mb-2 
        transition-colors duration-300 
        group-hover:text-[#63b3ff]">
        Join the waitlist:
      </h3>
      <p className="text-sm text-slate-300 mb-6 
        transition-colors duration-300 
        group-hover:text-[#63b3ff]/90">
        Be among the first to experience the future of investing
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="transform transition-transform duration-300 group-hover:translate-y-[-2px]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2 rounded-lg 
              bg-white/5 border border-slate-700 
              text-white placeholder-slate-400 
              transition-all duration-300
              focus:outline-none focus:ring-2 focus:ring-[#4299e1]
              group-hover:border-[#4299e1] group-hover:bg-[#4299e1]/10
              group-hover:placeholder-[#63b3ff]/70 mb-3"
            required
          />
        </div>
        
        <div className="transform transition-transform duration-300 group-hover:translate-y-[-2px]">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full px-4 py-2 rounded-lg 
              bg-white/5 border border-slate-700 
              text-white placeholder-slate-400 
              transition-all duration-300
              focus:outline-none focus:ring-2 focus:ring-[#4299e1]
              group-hover:border-[#4299e1] group-hover:bg-[#4299e1]/10
              group-hover:placeholder-[#63b3ff]/70"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full bg-[#4299e1] text-white font-semibold py-3 px-6 rounded-lg 
            transition-all duration-300 ease-in-out
            hover:bg-[#63b3ff] hover:scale-105 
            hover:shadow-[0_0_20px_rgba(66,153,225,0.4)]
            transform active:scale-95
            group-hover:bg-[#63b3ff]
            disabled:opacity-50 disabled:hover:scale-100 
            disabled:hover:bg-[#4299e1] disabled:hover:shadow-none"
        >
          {status === 'loading' ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Joining...</span>
            </div>
          ) : (
            'Join Waitlist'
          )}
        </button>

        {status === 'success' && (
          <p className="text-[#63b3ff] text-sm text-center animate-fadeIn">
            Thanks for joining! We'll keep you updated.
          </p>
        )}
        
        {status === 'error' && (
          <p className="text-red-400 text-sm text-center">
            {errorMessage || 'Something went wrong. Please try again.'}
          </p>
        )}
      </form>
    </div>
  )
} 