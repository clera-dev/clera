"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";

interface AgreementViewerProps {
  agreementUrl: string;
  title: string;
}

export default function AgreementViewer({ agreementUrl, title }: AgreementViewerProps) {
  const [open, setOpen] = useState(false);
  
  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  
  return (
    <div className="flex items-center gap-2">
      <button 
        type="button"
        className="text-sm text-primary underline inline-flex items-center gap-1"
        onClick={() => setOpen(true)}
      >
        Read {title}
      </button>
      
      <button
        type="button"
        onClick={() => openInNewTab(agreementUrl)}
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        title={`Open ${title} in new tab`}
      >
        <ExternalLink size={12} />
        <span className="sr-only md:not-sr-only">Open in new tab</span>
      </button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          
          <div className="p-4 bg-muted rounded-md">
            <p className="mb-4">
              Chrome is blocking the embedded view of this document for security reasons.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={() => openInNewTab(agreementUrl)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                <ExternalLink size={16} />
                Open in new tab
              </button>
              
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 