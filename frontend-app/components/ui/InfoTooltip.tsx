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

// Helper function to validate content for XSS safety
const validateContent = (content: React.ReactNode): React.ReactNode => {
  // Allow strings, numbers, and safe React elements
  if (typeof content === 'string' || typeof content === 'number') {
    return content;
  }
  
  // Allow React elements that are safe (not user-generated HTML)
  if (React.isValidElement(content)) {
    // Only allow basic HTML elements with safe props
    const allowedElements = ['p', 'span', 'div', 'strong', 'em', 'br', 'ul', 'ol', 'li'];
    const elementType = typeof content.type === 'string' ? content.type : '';
    
    if (allowedElements.includes(elementType)) {
      return content;
    }
  }
  
  // For arrays, validate each child
  if (Array.isArray(content)) {
    return content.map(validateContent);
  }
  
  // If content is not safe, return a sanitized string version
  console.warn('[InfoTooltip] Potentially unsafe content detected, rendering as string');
  return String(content);
};

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

  // Validate content to prevent XSS
  const safeContent = React.useMemo(() => validateContent(content), [content]);

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild onClick={handleTriggerClick}>
          {children}
        </TooltipTrigger>
        <TooltipContent>
          {safeContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
} 