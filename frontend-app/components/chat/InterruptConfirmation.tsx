'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Check, X } from 'lucide-react';

interface InterruptConfirmationProps {
  interrupt: {
    value: string;
    runId: string;
    resumable: boolean;
    ns?: string[];
  };
  onConfirm: (response: boolean) => void;
  isLoading: boolean;
}

export function InterruptConfirmation({ interrupt, onConfirm, isLoading }: InterruptConfirmationProps) {
  const [selectedResponse, setSelectedResponse] = useState<boolean | null>(null);

  const handleResponse = (response: boolean) => {
    if (isLoading) return;
    
    setSelectedResponse(response);
    onConfirm(response);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ 
          type: "spring",
          duration: 0.4,
          bounce: 0.3
        }}
        className="relative w-full max-w-2xl mx-auto"
      >
        {/* Backdrop blur effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl" />
        
        {/* Main container */}
        <div className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-2xl p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="text-white font-bold text-lg"
                >
                  ⚠️
                </motion.div>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Confirmation Required
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please review and confirm this action
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="bg-gray-50/50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200/30 dark:border-gray-700/30">
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
              {interrupt.value}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center space-x-4">
            {/* No button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleResponse(false)}
              disabled={isLoading}
              className={`
                relative overflow-hidden px-6 py-3 rounded-xl font-medium transition-all duration-200
                ${selectedResponse === false 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/25' 
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                border border-gray-200 dark:border-gray-700
              `}
            >
              <div className="flex items-center space-x-2">
                <X className="w-4 h-4" />
                <span>No, Cancel</span>
              </div>
              
              {selectedResponse === false && isLoading && (
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              )}
            </motion.button>

            {/* Yes button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleResponse(true)}
              disabled={isLoading}
              className={`
                relative overflow-hidden px-6 py-3 rounded-xl font-medium transition-all duration-200
                ${selectedResponse === true 
                  ? 'bg-green-500 text-white shadow-lg shadow-green-500/25' 
                  : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg shadow-blue-500/25'
                }
                ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>Yes, Proceed</span>
              </div>
              
              {selectedResponse === true && isLoading && (
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              )}
            </motion.button>
          </div>

          {/* Loading indicator */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-center space-x-2 text-sm text-gray-500 dark:text-gray-400"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
                />
                <span>Processing your response...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
} 