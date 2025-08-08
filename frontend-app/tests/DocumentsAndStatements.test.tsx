import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DocumentsAndStatements from '@/components/dashboard/DocumentsAndStatements';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch
global.fetch = jest.fn();

// Mock URL.createObjectURL and URL.revokeObjectURL for download tests
global.URL.createObjectURL = jest.fn(() => 'mocked-blob-url');
global.URL.revokeObjectURL = jest.fn();

// Mock document.createElement for download tests
const originalCreateElement = document.createElement;
document.createElement = jest.fn((tagName: string) => {
  if (tagName === 'a') {
    // Create a real anchor element and mock its methods/properties
    const anchor = document.createElement.call(document, 'a') as HTMLAnchorElement;
    anchor.click = jest.fn();
    anchor.style = {} as any;
    anchor.href = '';
    anchor.download = '';
    (global as any).lastCreatedAnchor = anchor;
    return anchor;
  }
  return originalCreateElement.call(document, tagName);
});

// Mock document.body.appendChild and removeChild for download tests
document.body.appendChild = jest.fn();
document.body.removeChild = jest.fn();

const mockDocuments = [
  {
    id: 'doc-1',
    name: 'Account Statement - October 2024',
    type: 'account_statement',
    sub_type: null,
    date: '2024-10-31',
    display_name: 'Account Statement - October 2024',
    description: 'Monthly account statement showing your portfolio activity and balances'
  },
  {
    id: 'doc-2',
    name: 'Trade Confirmation - AAPL Purchase',
    type: 'trade_confirmation',
    sub_type: null,
    date: '2024-10-15',
    display_name: 'Trade Confirmation - AAPL Purchase',
    description: 'Confirmation of executed trades and transactions'
  },
  {
    id: 'doc-3',
    name: '1099-B Tax Form',
    type: 'tax_1099_b_form',
    sub_type: null,
    date: '2024-01-31',
    display_name: '1099-B Tax Form',
    description: 'Official 1099-B tax form for filing with the IRS'
  }
];

const mockDocumentsResponse = {
  account_id: 'test-account-id',
  documents: mockDocuments,
  count: 3,
  filters: {
    start_date: null,
    end_date: null,
    document_type: null
  }
};

describe('DocumentsAndStatements Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('test-account-id');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep loading state
      );

      render(<DocumentsAndStatements />);
      
      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    });
  });

  describe('Error State', () => {
    it('should show error message when fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
        expect(screen.getByText('Try again')).toBeInTheDocument();
      });
    });

    it('should show error when no account ID is found', async () => {
      localStorageMock.getItem.mockReturnValue(null);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('No account ID found'));

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('No account ID found')).toBeInTheDocument();
      });
    });

    it('should show error when API returns error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ error: 'Access denied' })
      });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Access denied')).toBeInTheDocument();
      });
    });

    it('should show error when API returns invalid response format', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' })
      });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid response format from server')).toBeInTheDocument();
      });
    });

    it('should retry fetch when retry button is clicked', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDocumentsResponse)
        });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Try again'));

      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
        expect(screen.getByText('Trade Confirmation - AAPL Purchase')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no documents are returned', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockDocumentsResponse, documents: [], count: 0 })
      });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('No documents found')).toBeInTheDocument();
        expect(screen.getByText('Documents will appear here as they become available')).toBeInTheDocument();
      });
    });

    it('should show refresh button in empty state', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockDocumentsResponse, documents: [], count: 0 })
      });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Refresh documents')).toBeInTheDocument();
      });
    });
  });

  describe('Document Display', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse)
      });
    });

    it('should display documents correctly', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
        expect(screen.getByText('Trade Confirmation - AAPL Purchase')).toBeInTheDocument();
        expect(screen.getByText('1099-B Tax Form')).toBeInTheDocument();
      });
    });

    it('should show correct document type badges', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Statement')).toBeInTheDocument();
        expect(screen.getByText('Trade Confirmation')).toBeInTheDocument();
        expect(screen.getByText('1099-B')).toBeInTheDocument();
      });
    });

    it('should show download buttons for each document', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        const downloadButtons = screen.getAllByText('Download');
        expect(downloadButtons).toHaveLength(3);
      });
    });

    it('should show document dates', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('10/31/2024')).toBeInTheDocument();
        expect(screen.getByText('10/15/2024')).toBeInTheDocument();
        expect(screen.getByText('1/31/2024')).toBeInTheDocument();
      });
    });
  });

  describe('Document Type Filtering', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse)
      });
    });

    it('should show document type filter selector', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Filter:')).toBeInTheDocument();
        expect(screen.getByDisplayValue('All Documents')).toBeInTheDocument();
      });
    });

    it('should call API with document type filter when changed', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('All Documents')).toBeInTheDocument();
      });

      // Change filter to Account Statements
      const filterSelect = screen.getByDisplayValue('All Documents');
      fireEvent.change(filterSelect, { target: { value: 'account_statement' } });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('documentType=account_statement'),
          expect.any(Object)
        );
      });
    });

    it('should have all filter options available', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        const filterSelect = screen.getByDisplayValue('All Documents');
        expect(filterSelect).toBeInTheDocument();
        
        // Check that options exist (they're in the select element)
        const selectElement = filterSelect as HTMLSelectElement;
        const optionValues = Array.from(selectElement.options).map(option => option.value);
        
        expect(optionValues).toContain('all');
        expect(optionValues).toContain('account_statement');
        expect(optionValues).toContain('trade_confirmation');
        expect(optionValues).toContain('tax_statement');
      });
    });
  });

  describe('Document Details Modal', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse)
      });
    });

    it('should open modal when document is clicked', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      // Click on the document (not the download button)
      const documentElement = screen.getByText('Account Statement - October 2024');
      fireEvent.click(documentElement);

      await waitFor(() => {
        expect(screen.getByText('Document Details')).toBeInTheDocument();
        expect(screen.getByText('Monthly account statement showing your portfolio activity and balances')).toBeInTheDocument();
      });
    });

    it('should show correct document information in modal', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      const documentElement = screen.getByText('Account Statement - October 2024');
      fireEvent.click(documentElement);

      await waitFor(() => {
        expect(screen.getByText('Document ID:')).toBeInTheDocument();
        expect(screen.getByText('doc-1')).toBeInTheDocument();
        expect(screen.getByText('Type:')).toBeInTheDocument();
        expect(screen.getByText('Statement')).toBeInTheDocument();
      });
    });

    it('should close modal when close button is clicked', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      const documentElement = screen.getByText('Account Statement - October 2024');
      fireEvent.click(documentElement);

      await waitFor(() => {
        expect(screen.getByText('Document Details')).toBeInTheDocument();
      });

      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Document Details')).not.toBeInTheDocument();
      });
    });

    it('should have download button in modal', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      const documentElement = screen.getByText('Account Statement - October 2024');
      fireEvent.click(documentElement);

      await waitFor(() => {
        const downloadButtons = screen.getAllByText('Download');
        expect(downloadButtons.length).toBeGreaterThan(1); // One in modal, others in list
      });
    });
  });

  describe('Document Download', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse)
      });
    });

    it('should trigger download when download button is clicked', async () => {
      // Mock the download API response
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDocumentsResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(new Blob(['PDF content'], { type: 'application/pdf' }))
        });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      const downloadButtons = screen.getAllByText('Download');
      fireEvent.click(downloadButtons[0]);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/account/test-account-id/documents/doc-1/download`),
          expect.objectContaining({
            method: 'GET'
          })
        );
      });
    });

    it('should show loading state during download', async () => {
      // Mock the download API response with delay
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDocumentsResponse)
        })
        .mockImplementationOnce(() => 
          new Promise(resolve => 
            setTimeout(() => resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['PDF content'], { type: 'application/pdf' }))
            }), 100)
          )
        );

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      const downloadButtons = screen.getAllByText('Download');
      fireEvent.click(downloadButtons[0]);

      // Should show loading spinner
      expect(screen.getByTestId('loading-icon') || screen.getByRole('status')).toBeInTheDocument();
    });

    it('should create blob URL and trigger download', async () => {
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDocumentsResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(mockBlob)
        });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      const downloadButtons = screen.getAllByText('Download');
      fireEvent.click(downloadButtons[0]);

      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
        expect((global as any).lastCreatedAnchor.click).toHaveBeenCalled();
        expect(document.body.appendChild).toHaveBeenCalled();
        expect(document.body.removeChild).toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mocked-blob-url');
      });
    });

    it('should handle download errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDocumentsResponse)
        })
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Not Found'
        });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByText('Account Statement - October 2024')).toBeInTheDocument();
      });

      const downloadButtons = screen.getAllByText('Download');
      fireEvent.click(downloadButtons[0]);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Error downloading document:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('API Integration', () => {
    it('should call correct API endpoint with account ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse)
      });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/portfolio/documents?accountId=test-account-id'),
          expect.objectContaining({
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })
        );
      });
    });

    it('should include document type filter in API call', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse)
      });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('All Documents')).toBeInTheDocument();
      });

      // Change filter
      const filterSelect = screen.getByDisplayValue('All Documents');
      fireEvent.change(filterSelect, { target: { value: 'tax_statement' } });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('documentType=tax_statement'),
          expect.any(Object)
        );
      });
    });

    it('should sort documents by date (newest first)', async () => {
      const unsortedDocuments = [
        { ...mockDocuments[2], date: '2024-01-31' }, // Oldest
        { ...mockDocuments[0], date: '2024-10-31' }, // Newest
        { ...mockDocuments[1], date: '2024-10-15' }  // Middle
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ...mockDocumentsResponse,
          documents: unsortedDocuments
        })
      });

      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        const documentNames = screen.getAllByText(/Account Statement|Trade Confirmation|1099-B/);
        expect(documentNames[0]).toHaveTextContent('Account Statement - October 2024'); // Newest first
        expect(documentNames[1]).toHaveTextContent('Trade Confirmation - AAPL Purchase');
        expect(documentNames[2]).toHaveTextContent('1099-B Tax Form'); // Oldest last
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDocumentsResponse)
      });
    });

    it('should have proper ARIA labels and roles', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument(); // Filter select
      });
    });

    it('should support keyboard navigation', async () => {
      render(<DocumentsAndStatements />);
      
      await waitFor(() => {
        const downloadButton = screen.getAllByText('Download')[0];
        expect(downloadButton).toBeInTheDocument();
        
        // Download button should be focusable
        downloadButton.focus();
        expect(downloadButton).toHaveFocus();
      });
    });
  });
}); 