"use client";

import { ExternalLink } from "lucide-react";

interface AgreementViewerProps {
  agreementUrl: string;
  title: string;
}

export default function AgreementViewer({ agreementUrl, title }: AgreementViewerProps) {
  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  
  return (
    <div className="flex items-center gap-2">
      <button 
        type="button"
        className="text-sm text-primary underline inline-flex items-center gap-1 hover:text-primary/80 transition-colors"
        onClick={() => openInNewTab(agreementUrl)}
      >
        Read {title}
        <ExternalLink size={14} />
      </button>
    </div>
  );
} 