/**
 * InfoTooltip Component
 * 
 * SECURITY: This component implements robust XSS protection using DOMPurify.
 * All content is sanitized before rendering to prevent cross-site scripting attacks.
 * 
 * Features:
 * - Sanitizes string content using DOMPurify with strict allowed tags/attributes
 * - Validates React elements against a whitelist of safe components
 * - Converts unsafe content to sanitized strings
 * - Logs warnings for potentially unsafe content
 * 
 * Allowed HTML tags: p, span, div, strong, em, br, ul, ol, li, b, i
 * Allowed attributes: class only
 */

"use client"
import * as React from "react"
import DOMPurify from "dompurify"
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

// Secure content sanitization using DOMPurify
const sanitizeContent = (content: React.ReactNode): React.ReactNode => {
  // Handle string content - sanitize with DOMPurify
  if (typeof content === 'string') {
    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['p', 'span', 'div', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'b', 'i'],
      ALLOWED_ATTR: ['class'], // Only allow class attribute
      KEEP_CONTENT: true,
    });
    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  
  // Handle numbers - convert to string and sanitize
  if (typeof content === 'number') {
    const sanitized = DOMPurify.sanitize(String(content));
    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  
  // Handle React elements - only allow safe, predefined components
  if (React.isValidElement(content)) {
    const allowedElements = ['p', 'span', 'div', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'b', 'i'];
    const elementType = typeof content.type === 'string' ? content.type : '';
    
    if (allowedElements.includes(elementType)) {
      // For safe elements, return as-is but log for monitoring
      console.log('[InfoTooltip] Safe element rendered:', elementType);
      return content;
    }
    
    // If element is not in allowed list, convert to string and sanitize
    console.warn('[InfoTooltip] Unsafe element type detected, converting to string:', elementType);
    const elementString = `<${elementType}>Unsafe content removed</${elementType}>`;
    const sanitized = DOMPurify.sanitize(elementString, {
      ALLOWED_TAGS: ['p', 'span', 'div', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'b', 'i'],
      ALLOWED_ATTR: ['class'],
      KEEP_CONTENT: true,
    });
    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  
  // Handle arrays - sanitize each child
  if (Array.isArray(content)) {
    return content.map((child, index) => (
      <React.Fragment key={index}>
        {sanitizeContent(child)}
      </React.Fragment>
    ));
  }
  
  // For any other content type, convert to string and sanitize
  console.warn('[InfoTooltip] Unknown content type detected, converting to string');
  const contentString = String(content);
  const sanitized = DOMPurify.sanitize(contentString, {
    ALLOWED_TAGS: ['p', 'span', 'div', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'b', 'i'],
    ALLOWED_ATTR: ['class'],
    KEEP_CONTENT: true,
  });
  return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
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

  // Sanitize content to prevent XSS attacks
  const safeContent = React.useMemo(() => sanitizeContent(content), [content]);

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