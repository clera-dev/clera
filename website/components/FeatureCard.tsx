import React from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'

interface FeatureProps {
  title: string
  description: string
  icon: LucideIcon
  iconColor?: string
}

export default function FeatureCard({ feature }: { feature: FeatureProps }) {
  const IconComponent = feature.icon
  
  return (
    <motion.div 
      className="bg-[#0a0a0f]/60 backdrop-blur-sm rounded-xl p-8 border border-white/5 hover:border-[#4299e1]/30 transition-all duration-300 h-full min-h-[320px]"
      whileHover={{ 
        y: -5,
        boxShadow: '0 10px 30px -15px rgba(66, 153, 225, 0.2)'
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col h-full">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-5 ${feature.iconColor || 'bg-[#4299e1]/10'}`}>
          <IconComponent className={`w-6 h-6 ${feature.iconColor ? 'text-white' : 'text-[#4299e1]'}`} />
        </div>
        <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
        <p className="text-slate-400 text-sm leading-relaxed flex-grow">{feature.description}</p>
      </div>
    </motion.div>
  )
} 