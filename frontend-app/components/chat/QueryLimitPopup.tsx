'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock } from 'lucide-react'

interface QueryLimitPopupProps {
  isVisible: boolean
  nextResetTime: string // UTC timestamp string
  onDismiss: () => void
}

export default function QueryLimitPopup({ 
  isVisible, 
  nextResetTime,
  onDismiss 
}: QueryLimitPopupProps) {
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ 
            duration: 0.2, 
            ease: [0.4, 0.0, 0.2, 1] 
          }}
          className="mb-4 mx-auto max-w-md"
        >
          {/* Main container with glass-morphism effect */}
          <div className="bg-orange-50/80 backdrop-blur-sm border border-orange-200/50 rounded-xl p-4 shadow-lg">
            <div className="flex items-center gap-3">
              {/* Clock icon */}
              <div className="flex-shrink-0">
                <div className="w-5 h-5 text-orange-500">
                  <Clock className="w-5 h-5" />
                </div>
              </div>

              {/* Message content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-orange-700">
                  Daily query limit reached
                </p>
                <p className="text-xs text-orange-600 mt-0.5">
                  Next queries available: {nextResetTime} UTC
                </p>
              </div>

              {/* Dismiss button */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <motion.button
                  onClick={onDismiss}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="p-1.5 text-orange-400 hover:text-orange-600 transition-colors duration-200"
                  aria-label="Dismiss"
                >
                  <svg 
                    className="w-4 h-4" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M6 18L18 6M6 6l12 12" 
                    />
                  </svg>
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
