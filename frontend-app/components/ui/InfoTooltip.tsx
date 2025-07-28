"use client"
import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip" // Assuming this is the path to your existing tooltip component

interface InfoTooltipProps {
  children: React.ReactNode
  content: React.ReactNode
}

export function InfoTooltip({ children, content }: InfoTooltipProps) {
  const [open, setOpen] = React.useState(false)

  const isMobile = () => {
    if (typeof window === "undefined") return false
    return window.innerWidth <= 768 // You can adjust this breakpoint
  }

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (isMobile()) {
      e.preventDefault() // Prevent any default behavior
      setOpen(!open)
    }
  }

  const handleOpenChange = (isOpen: boolean) => {
    // For desktop, the default hover behavior is maintained.
    // For mobile, we control the state manually.
    if (!isMobile()) {
      setOpen(isOpen)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild onClick={handleTriggerClick}>
          {children}
        </TooltipTrigger>
        <TooltipContent>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
} 