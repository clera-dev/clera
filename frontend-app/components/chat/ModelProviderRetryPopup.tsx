'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Wifi, WifiOff } from 'lucide-react'

interface ModelProviderRetryPopupProps {
  isVisible: boolean
  onRetry: () => Promise<void>
  onDismiss: () => void
}

export default function ModelProviderRetryPopup({ 
  isVisible, 
  onRetry, 
  onDismiss 
}: ModelProviderRetryPopupProps) {
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }

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
          <div className="bg-gray-50/80 backdrop-blur-sm border border-gray-200/50 rounded-xl p-4 shadow-lg">
            <div className="flex items-center gap-3">
              {/* Connection icon with animation */}
              <div className="flex-shrink-0">
                <motion.div
                  animate={{ rotate: isRetrying ? 360 : 0 }}
                  transition={{ 
                    duration: 1, 
                    repeat: isRetrying ? Infinity : 0, 
                    ease: "linear" 
                  }}
                  className="w-5 h-5 text-gray-500"
                >
                  {isRetrying ? (
                    <RotateCcw className="w-5 h-5" />
                  ) : (
                    <WifiOff className="w-5 h-5" />
                  )}
                </motion.div>
              </div>

              {/* Message content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">
                  {isRetrying ? 'Reconnecting...' : 'Having trouble connecting'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isRetrying 
                    ? 'Please wait while we reconnect to our AI service'
                    : 'Our AI service is temporarily unavailable'
                  }
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Retry button */}
                <motion.button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200
                    ${isRetrying 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                      : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 shadow-sm hover:shadow-md'
                    }
                  `}
                >
                  <div className="flex items-center gap-1.5">
                    {isRetrying && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-3 h-3"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </motion.div>
                    )}
                    <span>{isRetrying ? 'Retrying...' : 'Try again'}</span>
                  </div>
                </motion.button>

                {/* Dismiss button */}
                {!isRetrying && (
                  <motion.button
                    onClick={onDismiss}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors duration-200"
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
                )}
              </div>
            </div>

            {/* Progress indicator */}
            {isRetrying && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 pt-3 border-t border-gray-200/50"
              >
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="flex-1 bg-gray-200 rounded-full h-1 overflow-hidden">
                    <motion.div
                      className="h-full bg-blue-500 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 3, ease: "easeInOut" }}
                    />
                  </div>
                  <span className="flex-shrink-0">Connecting...</span>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 