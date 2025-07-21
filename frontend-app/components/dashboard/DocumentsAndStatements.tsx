"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  FileText, 
  Download, 
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2
} from "lucide-react";

// Types
interface TradeDocument {
  id: string;
  name: string;
  type: string;
  sub_type?: string;
  date: string;
  display_name: string;
  description: string;
}

interface DocumentsResponse {
  account_id: string;
  documents: TradeDocument[];
  count: number;
  filters: {
    start_date?: string;
    end_date?: string;
    document_type?: string;
  };
}

type DocumentType = 'all' | 'account_statement' | 'trade_confirmation' | 'tax_statement';

// Utility functions
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
};

const getDocumentTypeColor = (type: string) => {
  switch (type) {
    case 'account_statement':
      return 'bg-blue-500';
    case 'trade_confirmation':
      return 'bg-green-500';
    case 'tax_statement':
    case 'tax_1099_b_form':
    case 'tax_1099_div_form':
    case 'tax_1099_int_form':
      return 'bg-purple-500';
    case 'account_application':
      return 'bg-orange-500';
    default:
      return 'bg-gray-500';
  }
};

const getDocumentTypeIcon = (type: string) => {
  switch (type) {
    case 'account_statement':
      return <FileText className="h-5 w-5 text-blue-600" />;
    case 'trade_confirmation':
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    case 'tax_statement':
    case 'tax_1099_b_form':
    case 'tax_1099_div_form':
    case 'tax_1099_int_form':
      return <FileText className="h-5 w-5 text-purple-600" />;
    case 'account_application':
      return <FileText className="h-5 w-5 text-orange-600" />;
    default:
      return <FileText className="h-5 w-5 text-gray-500" />;
  }
};

const getDisplayType = (type: string) => {
  const typeNames: Record<string, string> = {
    'account_statement': 'Statement',
    'trade_confirmation': 'Trade Confirmation',
    'trade_confirmation_json': 'Trade Data',
    'tax_statement': 'Tax Statement',
    'tax_1099_b_form': '1099-B',
    'tax_1099_b_details': '1099-B Details',
    'tax_1099_div_form': '1099-DIV',
    'tax_1099_div_details': '1099-DIV Details',
    'tax_1099_int_form': '1099-INT',
    'tax_1099_int_details': '1099-INT Details',
    'tax_w8': 'W-8 Form',
    'account_application': 'Application'
  };
  
  return typeNames[type] || 'Document';
};

// Custom hook for documents data
const useDocuments = (documentType: DocumentType) => {
  const [documents, setDocuments] = useState<TradeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const accountId = localStorage.getItem('alpacaAccountId');
      if (!accountId) {
        throw new Error('No account ID found');
      }

      // Build query params
      const params = new URLSearchParams({
        accountId: accountId
      });

      // Add document type filter if not 'all'
      if (documentType !== 'all') {
        params.append('documentType', documentType);
      }

      const response = await fetch(`/api/portfolio/documents?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch documents: ${response.statusText}`);
      }

      const data: DocumentsResponse = await response.json();

      if (Array.isArray(data.documents)) {
        // Filter out JSON documents (type === 'trade_confirmation_json')
        const pdfDocuments = data.documents.filter(doc => doc.type !== 'trade_confirmation_json');
        // Sort documents by date (newest first)
        const sortedDocuments = pdfDocuments.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        
        setDocuments(sortedDocuments);
      } else {
        console.error('Documents: Invalid response format', data);
        setError('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError(error instanceof Error ? error.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [documentType]);

  return { documents, isLoading, error, refetch: fetchDocuments };
};

// Document Type Selector Component
interface DocumentTypeSelectorProps {
  documentType: DocumentType;
  onDocumentTypeChange: (type: DocumentType) => void;
}

const DocumentTypeSelector = ({ documentType, onDocumentTypeChange }: DocumentTypeSelectorProps) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">Filter:</span>
    <select
      value={documentType}
      onChange={(e) => onDocumentTypeChange(e.target.value as DocumentType)}
      className="text-sm border border-border rounded px-2 py-1 bg-background text-foreground"
    >
      <option value="all">All Documents</option>
      <option value="account_statement">Account Statements</option>
      <option value="trade_confirmation">Trade Confirmations</option>
      <option value="tax_statement">Tax Documents</option>
    </select>
  </div>
);

// Loading State Component
const DocumentsLoading = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        Documents and Statements
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    </CardContent>
  </Card>
);

// Error State Component
interface DocumentsErrorProps {
  error: string;
  onRetry: () => void;
}

const DocumentsError = ({ error, onRetry }: DocumentsErrorProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        Documents and Statements
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>
        <button 
          onClick={onRetry}
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Try again
        </button>
      </div>
    </CardContent>
  </Card>
);

// Empty State Component
interface DocumentsEmptyProps {
  documentType: DocumentType;
  onDocumentTypeChange: (type: DocumentType) => void;
  onRetry: () => void;
}

const DocumentsEmpty = ({ documentType, onDocumentTypeChange, onRetry }: DocumentsEmptyProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents and Statements
        </CardTitle>
        <DocumentTypeSelector documentType={documentType} onDocumentTypeChange={onDocumentTypeChange} />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-center py-8">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <p className="text-muted-foreground">No documents found</p>
        <p className="text-sm text-muted-foreground mt-1">
          Documents will appear here as they become available
        </p>
        <div className="mt-4">
          <button 
            onClick={onRetry}
            className="text-blue-600 hover:text-blue-800 underline text-sm"
          >
            Refresh documents
          </button>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Document Item Component
interface DocumentItemProps {
  document: TradeDocument;
  onDownload: (document: TradeDocument) => void;
  onViewDetails: (document: TradeDocument) => void;
  isDownloading: boolean;
}

const DocumentItem = ({ document, onDownload, onViewDetails, isDownloading }: DocumentItemProps) => {
  const documentDate = formatDate(document.date);
  
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
      <div 
        className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
        onClick={() => onViewDetails(document)}
      >
        <div className="flex-shrink-0">
          {getDocumentTypeIcon(document.type)}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-foreground text-sm truncate">
              {document.display_name}
            </p>
            <Badge className={`text-xs ${getDocumentTypeColor(document.type)}`}>
              {getDisplayType(document.type)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{documentDate.date}</span>
          </div>
        </div>
      </div>
      
      <div className="flex-shrink-0 ml-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(document);
          }}
          disabled={isDownloading}
          className="h-8 px-3"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Download className="h-4 w-4 mr-1" />
              Download
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

// Document Details Modal Component
interface DocumentDetailsModalProps {
  document: TradeDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (document: TradeDocument) => void;
  isDownloading: boolean;
}

const DocumentDetailsModal = ({ document, isOpen, onClose, onDownload, isDownloading }: DocumentDetailsModalProps) => {
  if (!document) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card text-foreground border-border shadow-xl z-50">
        <DialogHeader className="pb-2 border-border">
          <DialogTitle className="text-xl text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Document Summary */}
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">{document.display_name}</h3>
              <Badge className={`text-xs ${getDocumentTypeColor(document.type)}`}>
                {getDisplayType(document.type)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {document.description}
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(document.date).date}</span>
            </div>
          </div>

          {/* Document Info */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Document ID:</span>
              <span className="font-mono text-xs">{document.id}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <span>{getDisplayType(document.type)}</span>
            </div>
            
            {document.sub_type && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtype:</span>
                <span>{document.sub_type}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4 gap-2">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
            <Button 
              onClick={() => onDownload(document)}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Main DocumentsAndStatements Component
export default function DocumentsAndStatements() {
  const [documentType, setDocumentType] = useState<DocumentType>('all');
  const [selectedDocument, setSelectedDocument] = useState<TradeDocument | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);

  const { documents, isLoading, error, refetch } = useDocuments(documentType);

  const handleDocumentClick = (document: TradeDocument) => {
    setSelectedDocument(document);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDocument(null);
  };

  const handleDownload = async (tradeDocument: TradeDocument) => {
    try {
      setDownloadingDocumentId(tradeDocument.id);

      const accountId = localStorage.getItem('alpacaAccountId');
      if (!accountId) {
        throw new Error('No account ID found');
      }

      const response = await fetch(
        `/api/account/${accountId}/documents/${tradeDocument.id}/download`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download document');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${tradeDocument.display_name.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Error downloading document:', error);
      // You could add a toast notification here
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  // Render loading state
  if (isLoading) {
    return <DocumentsLoading />;
  }

  // Render error state
  if (error) {
    return <DocumentsError error={error} onRetry={refetch} />;
  }

  // Render empty state
  if (documents.length === 0) {
    return (
      <DocumentsEmpty
        documentType={documentType}
        onDocumentTypeChange={setDocumentType}
        onRetry={refetch}
      />
    );
  }

  // Render main content
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents and Statements
            </CardTitle>
            <DocumentTypeSelector documentType={documentType} onDocumentTypeChange={setDocumentType} />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {documents.map((document) => (
                <DocumentItem
                  key={document.id}
                  document={document}
                  onDownload={handleDownload}
                  onViewDetails={handleDocumentClick}
                  isDownloading={downloadingDocumentId === document.id}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <DocumentDetailsModal
        document={selectedDocument}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onDownload={handleDownload}
        isDownloading={downloadingDocumentId === selectedDocument?.id || false}
      />
    </>
  );
} 