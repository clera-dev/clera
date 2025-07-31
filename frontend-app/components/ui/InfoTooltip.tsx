/**
 * InfoTooltip Component
 * 
 * SECURITY: This component implements robust XSS protection using DOMPurify.
 * All content is sanitized before rendering to prevent cross-site scripting attacks.
 * 
 * Features:
 * - Sanitizes string content using DOMPurify with strict allowed tags/attributes
 * - Deeply sanitizes React elements by stripping dangerous props and recursively processing children
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
} from "./tooltip"

interface InfoTooltipProps {
  children: React.ReactNode
  content: React.ReactNode
}

// Dangerous props that can execute JavaScript or cause XSS
const DANGEROUS_PROPS = [
  'onClick', 'onLoad', 'onError', 'onMouseOver', 'onMouseEnter', 'onFocus',
  'onBlur', 'onSubmit', 'onChange', 'onInput', 'onKeyDown', 'onKeyUp',
  'onKeyPress', 'onScroll', 'onResize', 'onAbort', 'onBeforeUnload',
  'onError', 'onHashChange', 'onMessage', 'onOffline', 'onOnline',
  'onPageHide', 'onPageShow', 'onPopState', 'onStorage', 'onUnload',
  'dangerouslySetInnerHTML', 'suppressContentEditableWarning',
  'suppressHydrationWarning'
];

// Safe HTML elements that are allowed
const ALLOWED_HTML_TAGS = ['p', 'span', 'div', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'b', 'i'];

// Safe attributes that are allowed
const ALLOWED_ATTRIBUTES = ['class', 'className'];

/**
 * Deeply sanitizes a React element by:
 * 1. Stripping dangerous props
 * 2. Recursively sanitizing children
 * 3. Converting to safe string representation if needed
 */
const sanitizeReactElement = (element: React.ReactElement): React.ReactNode => {
  const { type, props } = element;
  
  // Handle string-based HTML elements
  if (typeof type === 'string') {
    const elementType = type.toLowerCase();
    
    // Check if this is an allowed HTML tag
    if (ALLOWED_HTML_TAGS.includes(elementType)) {
      // Create a new props object with only safe attributes
      const safeProps: Record<string, any> = {};
      
      // Only copy allowed attributes
      if (props && typeof props === 'object') {
        Object.keys(props).forEach(key => {
          if (ALLOWED_ATTRIBUTES.includes(key) && !DANGEROUS_PROPS.includes(key)) {
            safeProps[key] = (props as Record<string, any>)[key];
          }
        });
      }
      
      // Recursively sanitize children
      const safeChildren = React.Children.map((props as any)?.children, child => {
        if (React.isValidElement(child)) {
          return sanitizeReactElement(child);
        }
        return sanitizeContent(child);
      });
      
      // Create a new element with sanitized props and children
      return React.createElement(type, safeProps, safeChildren);
    } else {
      // Not an allowed HTML tag - convert to string and sanitize
      console.warn('[InfoTooltip] Disallowed HTML tag detected:', elementType);
      return convertToSafeString(element);
    }
  }
  
  // Handle React components (not HTML elements)
  // These are potentially dangerous, so convert to string
  console.warn('[InfoTooltip] React component detected, converting to string:', typeof type);
  return convertToSafeString(element);
};

/**
 * Converts any React element to a safe string representation
 */
const convertToSafeString = (element: React.ReactElement): React.ReactNode => {
  try {
    // Try to extract text content from the element
    const textContent = React.Children.toArray((element.props as any)?.children || [])
      .map(child => {
        if (typeof child === 'string' || typeof child === 'number') {
          return String(child);
        }
        if (React.isValidElement(child)) {
          return convertToSafeString(child);
        }
        return '';
      })
      .join('');
    
    const sanitized = DOMPurify.sanitize(textContent, {
      ALLOWED_TAGS: ALLOWED_HTML_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
      KEEP_CONTENT: true,
    });
    
    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
  } catch (error) {
    console.error('[InfoTooltip] Error converting element to string:', error);
    return <span>Content removed for security</span>;
  }
};

// Secure content sanitization using DOMPurify
const sanitizeContent = (content: React.ReactNode): React.ReactNode => {
  // Handle string content - sanitize with DOMPurify
  if (typeof content === 'string') {
    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ALLOWED_HTML_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
      KEEP_CONTENT: true,
    });
    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  
  // Handle numbers - convert to string and sanitize
  if (typeof content === 'number') {
    const sanitized = DOMPurify.sanitize(String(content), {
      ALLOWED_TAGS: ALLOWED_HTML_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
      KEEP_CONTENT: true,
    });
    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  
  // Handle React elements - deeply sanitize
  if (React.isValidElement(content)) {
    return sanitizeReactElement(content);
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
    ALLOWED_TAGS: ALLOWED_HTML_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
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