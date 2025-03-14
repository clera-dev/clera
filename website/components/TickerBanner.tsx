'use client'

import React, { useEffect, useState, useRef } from 'react'
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion'

// Sample ticker data (would be replaced with API data in production)
const initialTickers = [
  { symbol: 'SPY', name: 'S&P 500 ETF', price: 538.72, change: 0.84 },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', price: 464.29, change: 1.25 },
  { symbol: 'AGG', name: 'US Aggregate Bond ETF', price: 99.15, change: -0.15 },
  { symbol: 'VTI', name: 'Total Stock Market ETF', price: 265.91, change: 0.73 },
  { symbol: 'BND', name: 'Total Bond Market ETF', price: 72.08, change: -0.22 },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 217.94, change: 1.65 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 425.73, change: 0.93 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 172.38, change: 1.02 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 182.37, change: 0.78 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 189.83, change: -1.27 },
  { symbol: 'TLT', name: 'Long-Term Treasury ETF', price: 92.54, change: -0.42 },
  { symbol: 'IEF', name: 'Intermediate Treasury ETF', price: 96.37, change: -0.18 },
]

export default function TickerBanner() {
  const [tickers, setTickers] = useState(initialTickers)
  const tickerRef = useRef<HTMLDivElement>(null)
  const [tickerWidth, setTickerWidth] = useState(0)
  const baseX = useMotionValue(0)
  const x = useTransform(baseX, (v) => `${v}px`)
  
  // Measure the actual width of the ticker content
  useEffect(() => {
    if (tickerRef.current) {
      setTickerWidth(tickerRef.current.offsetWidth / 2)
    }
  }, [tickers])
  
  // Smooth continuous scrolling with manual animation frame
  useAnimationFrame((time, delta) => {
    const moveSpeed = 0.03 // Slower speed (adjust as needed)
    let newX = baseX.get() - moveSpeed * delta
    
    // Reset position when the first set is fully scrolled
    if (newX <= -tickerWidth) {
      newX = 0
    }
    
    baseX.set(newX)
  })
  
  // Simulate real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTickers(prevTickers => 
        prevTickers.map(ticker => ({
          ...ticker,
          price: +(ticker.price * (1 + (Math.random() * 0.002 - 0.001))).toFixed(2),
          change: +(ticker.change + (Math.random() * 0.1 - 0.05)).toFixed(2)
        }))
      )
    }, 3000)
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div className="w-full bg-[#0a0a0f]/80 backdrop-blur-sm border-y border-white/5 py-6 overflow-hidden">
      <div className="container mx-auto relative">
        <div className="flex items-center absolute left-0 h-full z-10">
          <div className="w-20 h-full bg-gradient-to-r from-[#0a0a0f]/80 to-transparent"></div>
        </div>
        <div className="flex items-center absolute right-0 h-full z-10">
          <div className="w-20 h-full bg-gradient-to-l from-[#0a0a0f]/80 to-transparent"></div>
        </div>
        
        <motion.div 
          ref={tickerRef}
          className="flex"
          style={{ x }}
        >
          {/* First set of tickers */}
          {tickers.map((ticker, index) => (
            <TickerItem key={`ticker-${index}`} ticker={ticker} />
          ))}
          
          {/* Duplicate set of tickers to create seamless loop */}
          {tickers.map((ticker, index) => (
            <TickerItem key={`ticker-dup-${index}`} ticker={ticker} />
          ))}
        </motion.div>
      </div>
    </div>
  )
}

const TickerItem = React.memo(({ ticker }: { ticker: any }) => {
  return (
    <div className="flex items-center whitespace-nowrap w-[260px] px-4 py-1 border-r border-white/5">
      <div className="flex flex-col w-[100px]">
        <span className="font-bold text-white">{ticker.symbol}</span>
        <span className="text-xs text-slate-400 truncate">{ticker.name}</span>
      </div>
      
      <div className="flex flex-col items-end w-[100px] ml-auto">
        <span className="text-white font-mono tabular-nums">${ticker.price.toFixed(2)}</span>
        <span className={`text-xs font-mono tabular-nums ${ticker.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {ticker.change >= 0 ? '+' : ''}{ticker.change.toFixed(2)}%
        </span>
      </div>
    </div>
  )
})

TickerItem.displayName = 'TickerItem' 