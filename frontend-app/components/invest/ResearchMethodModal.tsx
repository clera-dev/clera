"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HoverBorderGradient } from '@/components/ui/hover-border-gradient';
import { Brain, Search } from 'lucide-react';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';
import { generateContextualPrompt, sanitizePromptContext } from '@/utils/investmentHelpPrompts';
import { usePersonalizationData } from '@/hooks/usePersonalizationData';
import { usePortfolioStatus } from '@/hooks/usePortfolioStatus';
import { getAlpacaAccountId } from '@/lib/utils';

interface ResearchMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onManualSearch: () => void;
}

/**
 * Sleek modal that appears when user clicks search bar
 * Offers choice between AI-powered research with Clera vs manual search
 */
export function ResearchMethodModal({ isOpen, onClose, onManualSearch }: ResearchMethodModalProps) {
  const { openChatWithPrompt } = useCleraAssist();
  const { personalization } = usePersonalizationData();
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const { isEmpty: portfolioIsEmpty } = usePortfolioStatus(accountId);

  // Load account ID on mount
  React.useEffect(() => {
    const loadAccountId = async () => {
      const id = await getAlpacaAccountId();
      setAccountId(id);
    };
    loadAccountId();
  }, []);

  const handleCleraResearch = () => {
    // Generate intelligent prompt for research assistance
    const context = sanitizePromptContext({
      firstName: personalization?.firstName,
      hasPositions: !portfolioIsEmpty,
      riskTolerance: personalization?.riskTolerance,
      investmentGoals: personalization?.investmentGoals,
      experienceLevel: personalization?.experienceLevel,
    });
    
    const prompt = generateContextualPrompt(context);
    openChatWithPrompt(prompt, "research_method_choice");
    onClose();
  };

  const handleManualResearch = () => {
    onManualSearch();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-4 bg-black/95 border border-slate-800/50 rounded-2xl p-4 sm:p-6 overflow-hidden">
        {/* Header */}
        <DialogHeader className="text-center mb-4 sm:mb-6">
          <DialogTitle className="text-lg sm:text-xl font-bold text-white">
            How do you want to search?
          </DialogTitle>
        </DialogHeader>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Manual Research - Simple clickable card */}
          <div 
            onClick={handleManualResearch}
            className="bg-slate-900/50 border border-slate-700/50 hover:border-slate-600/50 rounded-xl p-3 sm:p-4 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-slate-600/10 hover:scale-[1.02] text-center"
          >
            {/* Icon */}
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-800/50 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3 border border-slate-700/50">
              <Search className="h-5 w-5 sm:h-6 sm:w-6 text-slate-400" />
            </div>

            {/* Content */}
            <h3 className="text-sm sm:text-lg font-bold text-white">
              Manual Search
            </h3>
          </div>

          {/* AI-Powered Research with Clera - Using HoverBorderGradient */}
          <HoverBorderGradient
            onClick={handleCleraResearch}
            as="div"
            containerClassName="w-full cursor-pointer rounded-xl !bg-black/95 hover:!bg-black/95"
            className="w-full !bg-gradient-to-br !from-blue-600/10 !to-purple-600/10 hover:!from-blue-600/10 hover:!to-purple-600/10 text-white p-3 sm:p-4 text-center relative rounded-xl"
            duration={1.5}
          >
            {/* Icon */}
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3 border border-blue-600/30">
              <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-blue-400" />
            </div>

            {/* Content */}
            <h3 className="text-sm sm:text-lg font-bold text-white">
              With Clera
            </h3>
          </HoverBorderGradient>
        </div>
      </DialogContent>
    </Dialog>
  );
}
