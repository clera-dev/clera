/**
 * Custom hook for managing PII data
 * Extracted from UpdateInformationPage to separate data management from UI
 */

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { PIIData, UpdateableFieldsData, PIIApiResponse, UpdateableFieldsApiResponse } from '@/lib/types/pii';
import { convertOnboardingToPII } from '@/lib/utils/pii-helpers';

interface UsePIIDataReturn {
  // State
  loading: boolean;
  saving: boolean;
  piiData: PIIData | null;
  updateableFields: UpdateableFieldsData | null;
  editedData: PIIData | null;
  hasChanges: boolean;
  error: string | null;
  success: string | null;
  alpacaAccountId: string | null;
  
  // Actions
  setEditedData: (data: PIIData | null) => void;
  handleInputChange: (section: string, field: string, value: any) => void;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  clearError: () => void;
  clearSuccess: () => void;
}

export const usePIIData = (): UsePIIDataReturn => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [piiData, setPiiData] = useState<PIIData | null>(null);
  const [updateableFields, setUpdateableFields] = useState<UpdateableFieldsData | null>(null);
  const [editedData, setEditedData] = useState<PIIData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch PII data from backend
  const fetchPIIData = async (accountId: string): Promise<PIIData> => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    const apiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY;
    
    if (!backendUrl || !apiKey) {
      throw new Error('Backend configuration missing');
    }

    // Get current user for authorization
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${backendUrl}/api/account/${accountId}/pii?user_id=${encodeURIComponent(user.id)}`, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Don't log raw error text to prevent PII exposure
      throw new Error(`Failed to fetch PII data: ${response.status}`);
    }

    const result: PIIApiResponse = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch PII data');
    }

    return result.data;
  };

  // Fetch updateable fields from backend
  const fetchUpdateableFields = async (accountId: string): Promise<UpdateableFieldsData> => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    const apiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY;
    
    if (!backendUrl || !apiKey) {
      throw new Error('Backend configuration missing');
    }

    // Get current user for authorization
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${backendUrl}/api/account/${accountId}/pii/updateable-fields?user_id=${encodeURIComponent(user.id)}`, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Don't log raw error text to prevent PII exposure
      throw new Error(`Failed to fetch updateable fields: ${response.status}`);
    }

    const result: UpdateableFieldsApiResponse = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to fetch updateable fields');
    }

    return result.data;
  };

  // Initialize data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('User not authenticated');
        }

        // Get user's account information
        const { data: accountData, error: accountError } = await supabase
          .from('accounts')
          .select('alpaca_account_id, alpaca_account_number, alpaca_account_status, created_at')
          .eq('user_id', user.id)
          .single();

        if (accountError || !accountData?.alpaca_account_id) {
          throw new Error('Account not found');
        }

        const accountId = accountData.alpaca_account_id;
        setAlpacaAccountId(accountId);

        // Fetch PII data and updateable fields in parallel
        const [piiDataResult, updateableFieldsResult] = await Promise.all([
          fetchPIIData(accountId),
          fetchUpdateableFields(accountId)
        ]);

        setPiiData(piiDataResult);
        setUpdateableFields(updateableFieldsResult);
        setEditedData(piiDataResult);

      } catch (err) {
        console.error('Error fetching PII data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load account information');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [supabase.auth]);

  // Check for changes when edited data changes
  useEffect(() => {
    if (piiData && editedData) {
      const stringify = (obj: any) => JSON.stringify(obj, Object.keys(obj).sort());
      const hasDataChanges = stringify(piiData) !== stringify(editedData);
      setHasChanges(hasDataChanges);
    }
  }, [piiData, editedData]);

  // Handle input changes
  const handleInputChange = (section: string, field: string, value: any) => {
    if (!editedData) return;

    setEditedData({
      ...editedData,
      [section]: {
        ...editedData[section as keyof PIIData],
        [field]: value,
      },
    });
  };

  // Handle save
  const handleSave = async () => {
    if (!alpacaAccountId || !editedData) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const apiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY;
      
      if (!backendUrl || !apiKey) {
        throw new Error('Backend configuration missing');
      }

      // Get current user for authorization
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`${backendUrl}/api/account/${alpacaAccountId}/pii?user_id=${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editedData),
      });

      if (!response.ok) {
        // Don't log raw error text to prevent PII exposure
        throw new Error(`Failed to update account: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update account information');
      }

      // Update the original data with the edited data
      setPiiData(editedData);
      setSuccess(result.message || 'Account information updated successfully');

    } catch (err) {
      console.error('Error updating PII data:', err);
      setError(err instanceof Error ? err.message : 'Failed to update account information');
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setEditedData(piiData);
    setError(null);
    setSuccess(null);
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Clear success
  const clearSuccess = () => {
    setSuccess(null);
  };

  return {
    // State
    loading,
    saving,
    piiData,
    updateableFields,
    editedData,
    hasChanges,
    error,
    success,
    alpacaAccountId,
    
    // Actions
    setEditedData,
    handleInputChange,
    handleSave,
    handleCancel,
    clearError,
    clearSuccess,
  };
}; 