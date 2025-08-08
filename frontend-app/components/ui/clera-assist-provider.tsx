"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface UserPreferences {
  isEnabled: boolean;
  assistanceLevel: 'minimal' | 'moderate' | 'helpful';
  dismissedSuggestions: Set<string>;
  preferredTrigger: 'hover' | 'tap' | 'auto';
}

interface CleraAssistContextType {
  // State
  isEnabled: boolean;
  userPreferences: UserPreferences;
  currentPage: string;
  isChatOpen: boolean;
  
  // Actions
  openChatWithPrompt: (prompt: string, context?: string) => void;
  setUserPreferences: (preferences: Partial<UserPreferences>) => void;
  dismissSuggestion: (suggestionId: string) => void;
  setCurrentPage: (page: string) => void;
  toggleChatVisibility: () => void;
  
  // Callbacks
  onToggleSideChat?: () => void;
  sideChatVisible?: boolean;
  onToggleMobileChat?: () => void;
  mobileChatVisible?: boolean;
}

const CleraAssistContext = createContext<CleraAssistContextType | undefined>(undefined);

interface CleraAssistProviderProps {
  children: ReactNode;
  onToggleSideChat?: () => void;
  sideChatVisible?: boolean;
  onToggleMobileChat?: () => void;
  mobileChatVisible?: boolean;
}

export const CleraAssistProvider: React.FC<CleraAssistProviderProps> = ({
  children,
  onToggleSideChat,
  sideChatVisible = false,
  onToggleMobileChat,
  mobileChatVisible = false
}) => {
  const [userPreferences, setUserPreferencesState] = useState<UserPreferences>({
    isEnabled: true,
    assistanceLevel: 'moderate',
    dismissedSuggestions: new Set(),
    preferredTrigger: 'hover'
  });
  
  const [currentPage, setCurrentPage] = useState<string>('');
  const { isMobile } = useBreakpoint();

  // Load user preferences from localStorage on mount
  React.useEffect(() => {
    const savedPreferences = localStorage.getItem('cleraAssistPreferences');
    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences);
        setUserPreferencesState(prev => ({
          ...prev,
          ...parsed,
          dismissedSuggestions: new Set(parsed.dismissedSuggestions || [])
        }));
      } catch (error) {
        console.error('Error loading Clera Assist preferences:', error);
      }
    }
  }, []);

  // Save preferences to localStorage when they change
  React.useEffect(() => {
    const preferencesToSave = {
      ...userPreferences,
      dismissedSuggestions: Array.from(userPreferences.dismissedSuggestions)
    };
    localStorage.setItem('cleraAssistPreferences', JSON.stringify(preferencesToSave));
  }, [userPreferences]);

  const openChatWithPrompt = useCallback((prompt: string, context?: string) => {
    // Use centralized breakpoint logic
    const currentlyMobile = isMobile;

    if (currentlyMobile) {
      // Enforce exclusivity: close side chat if open, open mobile chat if closed
      if (sideChatVisible) onToggleSideChat?.();
      if (!mobileChatVisible) onToggleMobileChat?.();
    } else {
      // Enforce exclusivity: close mobile chat if open, open side chat if closed
      if (mobileChatVisible) onToggleMobileChat?.();
      if (!sideChatVisible) onToggleSideChat?.();
    }
    
    // Wait a moment for the chat to open, then send the prompt
    setTimeout(() => {
      // Dispatch a custom event with the prompt
      window.dispatchEvent(new CustomEvent('cleraAssistPrompt', {
        detail: { prompt, context }
      }));
    }, 100);
    
  }, [onToggleSideChat, sideChatVisible, onToggleMobileChat, mobileChatVisible, isMobile]);

  const setUserPreferences = useCallback((newPreferences: Partial<UserPreferences>) => {
    setUserPreferencesState(prev => ({
      ...prev,
      ...newPreferences
    }));
  }, []);

  const dismissSuggestion = useCallback((suggestionId: string) => {
    setUserPreferencesState(prev => ({
      ...prev,
      dismissedSuggestions: new Set(Array.from(prev.dismissedSuggestions).concat(suggestionId))
    }));
  }, []);

  const toggleChatVisibility = useCallback(() => {
    // Use centralized breakpoint logic
    const currentlyMobile = isMobile;
    if (currentlyMobile) {
      // Close side chat if open, then toggle mobile
      if (sideChatVisible) onToggleSideChat?.();
      onToggleMobileChat?.();
    } else {
      // Close mobile chat if open, then toggle side
      if (mobileChatVisible) onToggleMobileChat?.();
      onToggleSideChat?.();
    }
  }, [onToggleSideChat, onToggleMobileChat, isMobile, sideChatVisible, mobileChatVisible]);

  // Enforce mutual exclusivity on breakpoint changes
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isMobile && sideChatVisible) {
      // Moving to mobile: ensure side chat is closed
      onToggleSideChat?.();
    } else if (!isMobile && mobileChatVisible) {
      // Moving to desktop: ensure mobile chat is closed
      onToggleMobileChat?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const contextValue: CleraAssistContextType = {
    // State
    isEnabled: userPreferences.isEnabled,
    userPreferences,
    currentPage,
    // Single source of truth: visibility comes solely from parent-provided state
    isChatOpen: !!(sideChatVisible || mobileChatVisible),
    
    // Actions
    openChatWithPrompt,
    setUserPreferences,
    dismissSuggestion,
    setCurrentPage,
    toggleChatVisibility,
    
    // Callbacks
    onToggleSideChat,
    sideChatVisible,
    onToggleMobileChat,
    mobileChatVisible
  };

  return (
    <CleraAssistContext.Provider value={contextValue}>
      {children}
    </CleraAssistContext.Provider>
  );
};

export const useCleraAssist = (): CleraAssistContextType => {
  const context = useContext(CleraAssistContext);
  if (!context) {
    throw new Error('useCleraAssist must be used within a CleraAssistProvider');
  }
  return context;
};

// Hook for generating contextual prompts
export const useContextualPrompt = (
  template: string,
  context: string,
  variables: Record<string, string> = {}
) => {
  return useCallback(() => {
    let prompt = template;
    
    // Replace template variables
    Object.entries(variables).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), value);
    });
    
    // Add context information
    const contextInfo = `\n\nContext: I'm currently on the ${context.replace(/_/g, ' ')} page.`;
    
    // Add conciseness instruction
    const conciseInstruction = "\n\nFocus on the most important points and actionable advice.";
    
    return prompt + contextInfo + conciseInstruction;
  }, [template, context, variables]);
}; 