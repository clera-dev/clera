"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, AlertCircle, CheckCircle, Info, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";

// Validation functions
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone: string): boolean => {
  // Allow formats: +1-234-567-8900, (234) 567-8900, 234-567-8900, 2345678900
  const phoneRegex = /^(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

const validatePostalCode = (postalCode: string): boolean => {
  // US ZIP codes: 12345 or 12345-6789
  const postalRegex = /^\d{5}(-\d{4})?$/;
  return postalRegex.test(postalCode);
};

const validateRequired = (value: string): boolean => {
  return value.trim().length > 0;
};

// Import the correct OnboardingData type
interface OnboardingData {
  // Contact Information
  email: string;
  phoneNumber: string;
  streetAddress: string[];
  city: string;
  state: string;
  postalCode: string;
  country: string;
  
  // Personal Information
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  taxIdType: string;
  taxId: string;
  countryOfCitizenship: string;
  countryOfBirth: string;
  countryOfTaxResidence: string;
  fundingSource: string[];
  
  // Disclosures
  isControlPerson: boolean;
  isAffiliatedExchangeOrFinra: boolean;
  isPoliticallyExposed: boolean;
  immediateFamilyExposed: boolean;
  
  // Agreements accepted
  agreementsAccepted: {
    margin: boolean;
    customer: boolean;
    account: boolean;
  };
}

interface PIIData {
  contact: {
    email?: string;
    phone?: string;
    street_address?: string[];
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  identity: {
    given_name?: string;
    middle_name?: string;
    family_name?: string;
    date_of_birth?: string;
    tax_id?: string;
    tax_id_type?: string;
    country_of_citizenship?: string;
    country_of_birth?: string;
    country_of_tax_residence?: string;
    funding_source?: string[];
  };
  disclosures: {
    is_control_person?: boolean;
    is_affiliated_exchange_or_finra?: boolean;
    is_politically_exposed?: boolean;
    immediate_family_exposed?: boolean;
  };
  account_info: {
    account_number?: string;
    status?: string;
    created_at?: string;
  };
}

interface UpdateableFieldsData {
  contact: {
    [key: string]: {
      updateable: boolean;
      description: string;
    };
  };
  identity: {
    [key: string]: {
      updateable: boolean;
      description: string;
    };
  };
  disclosures: {
    [key: string]: {
      updateable: boolean;
      description: string;
    };
  };
}

interface ValidationErrors {
  [key: string]: string;
}

export default function UpdateInformationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [piiData, setPiiData] = useState<PIIData | null>(null);
  const [updateableFields, setUpdateableFields] = useState<UpdateableFieldsData | null>(null);
  const [editedData, setEditedData] = useState<PIIData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [showSSN, setShowSSN] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Convert Supabase onboarding data to PII format using the correct structure
  const convertOnboardingToPII = (onboardingData: OnboardingData, accountInfo: any): PIIData => {
    return {
      contact: {
        email: onboardingData.email || '',
        phone: onboardingData.phoneNumber || '',
        street_address: onboardingData.streetAddress || [],
        city: onboardingData.city || '',
        state: onboardingData.state || '',
        postal_code: onboardingData.postalCode || '',
        country: onboardingData.country || '',
      },
      identity: {
        given_name: onboardingData.firstName || '',
        middle_name: onboardingData.middleName || '',
        family_name: onboardingData.lastName || '',
        date_of_birth: onboardingData.dateOfBirth || '',
        tax_id: onboardingData.taxId || '',
        tax_id_type: onboardingData.taxIdType || 'SSN',
        country_of_citizenship: onboardingData.countryOfCitizenship || '',
        country_of_birth: onboardingData.countryOfBirth || '',
        country_of_tax_residence: onboardingData.countryOfTaxResidence || '',
        funding_source: onboardingData.fundingSource || [],
      },
      disclosures: {
        is_control_person: onboardingData.isControlPerson || false,
        is_affiliated_exchange_or_finra: onboardingData.isAffiliatedExchangeOrFinra || false,
        is_politically_exposed: onboardingData.isPoliticallyExposed || false,
        immediate_family_exposed: onboardingData.immediateFamilyExposed || false,
      },
      account_info: {
        account_number: accountInfo?.alpaca_account_number || '',
        status: accountInfo?.alpaca_account_status || '',
        created_at: accountInfo?.created_at || '',
      },
    };
  };

  // Validation function
  const validateField = (section: string, field: string, value: any): string | null => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `${formatFieldName(field)} is required`;
    }

    switch (field) {
      case 'email':
        return validateEmail(value) ? null : 'Please enter a valid email address';
      case 'phone':
        return validatePhone(value) ? null : 'Please enter a valid phone number';
      case 'postal_code':
        return validatePostalCode(value) ? null : 'Please enter a valid postal code';
      case 'street_address':
        if (Array.isArray(value)) {
          return value.length > 0 && value.some(line => line.trim()) ? null : 'Street address is required';
        }
        return value.trim() ? null : 'Street address is required';
      case 'city':
      case 'state':
        return validateRequired(value) ? null : `${formatFieldName(field)} is required`;
      default:
        return null;
    }
  };

  // Validate all fields
  const validateAllFields = (): boolean => {
    const errors: ValidationErrors = {};
    
    if (editedData?.contact) {
      Object.keys(editedData.contact).forEach(field => {
        const value = editedData.contact[field as keyof typeof editedData.contact];
        const error = validateField('contact', field, value);
        if (error) {
          errors[`contact.${field}`] = error;
        }
      });
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const supabase = createClient();
        
        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push('/sign-in');
          return;
        }

        // Get onboarding data from Supabase
        const { data: onboardingData, error: onboardingError } = await supabase
          .from('user_onboarding')
          .select('alpaca_account_id, alpaca_account_number, alpaca_account_status, created_at, onboarding_data')
          .eq('user_id', user.id)
          .single();

        if (onboardingError || !onboardingData?.alpaca_account_id) {
          setError('Could not find your account information');
          setLoading(false);
          return;
        }

        setAlpacaAccountId(onboardingData.alpaca_account_id);

        // Convert Supabase data to PII format
        const piiDataFromSupabase = convertOnboardingToPII(
          onboardingData.onboarding_data as OnboardingData,
          onboardingData
        );

        // Get updateable fields from Alpaca API
        const fieldsResponse = await fetch(`/api/account/${onboardingData.alpaca_account_id}/pii/updateable-fields`);
        
        if (!fieldsResponse.ok) {
          throw new Error('Failed to fetch updateable fields');
        }

        const fieldsResult = await fieldsResponse.json();

        if (fieldsResult.success) {
          setPiiData(piiDataFromSupabase);
          setEditedData(JSON.parse(JSON.stringify(piiDataFromSupabase))); // Deep copy
          setUpdateableFields(fieldsResult.data);
        } else {
          throw new Error('Failed to load updateable fields');
        }

      } catch (err) {
        console.error('Error fetching PII data:', err);
        setError('Failed to load account information. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  useEffect(() => {
    // Check if there are changes
    if (piiData && editedData) {
      const hasChanges = JSON.stringify(piiData) !== JSON.stringify(editedData);
      setHasChanges(hasChanges);
    }
  }, [piiData, editedData]);

  const handleInputChange = (section: 'contact' | 'identity' | 'disclosures', field: string, value: any) => {
    if (!editedData) return;

    setEditedData(prev => {
      if (!prev) return prev;
      
      const newData = { ...prev };
      if (section === 'contact' && newData.contact) {
        if (field === 'street_address') {
          // Handle street address as array
          newData.contact.street_address = value.split('\n').filter((line: string) => line.trim());
        } else {
          (newData.contact as any)[field] = value;
        }
      } else if (section === 'identity' && newData.identity) {
        (newData.identity as any)[field] = value;
      } else if (section === 'disclosures' && newData.disclosures) {
        (newData.disclosures as any)[field] = value;
      }
      
      return newData;
    });

    // Clear validation error for this field when user starts typing
    const fieldKey = `${section}.${field}`;
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldKey];
      return newErrors;
    });

    // Real-time validation for the changed field
    const error = validateField(section, field, value);
    if (error) {
      setValidationErrors(prev => ({
        ...prev,
        [fieldKey]: error
      }));
    }

    // Check if there are any changes
    const hasAnyChanges = JSON.stringify(editedData) !== JSON.stringify(piiData);
    setHasChanges(hasAnyChanges);
  };

  const handleSave = async () => {
    if (!editedData || !alpacaAccountId) return;

    // Validate all fields before submitting
    if (!validateAllFields()) {
      setError('Please fix the validation errors before saving');
      toast.error('Please fix the validation errors before saving');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Only send updateable fields
      const updateData = {
        contact: {}
      };

      // Add only the contact fields that are updateable and have changed
      if (updateableFields?.contact) {
        Object.keys(updateableFields.contact).forEach(field => {
          if (updateableFields.contact[field].updateable && editedData.contact) {
            const originalValue = piiData?.contact?.[field as keyof typeof piiData.contact];
            const newValue = editedData.contact[field as keyof typeof editedData.contact];
            
            if (originalValue !== newValue && newValue !== undefined) {
              (updateData.contact as any)[field] = newValue;
            }
          }
        });
      }

      if (Object.keys(updateData.contact).length === 0) {
        setError('No updateable fields were changed');
        return;
      }

      // Update Alpaca account via API
      const response = await fetch(`/api/account/${alpacaAccountId}/pii`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Your information has been updated successfully');
        setPiiData(editedData); // Update the original data to reflect changes
        setHasChanges(false);
        setValidationErrors({}); // Clear validation errors on success
        toast.success('Your personal information has been updated successfully!');
      } else {
        setError(result.error || 'Failed to update your information');
      }

    } catch (err) {
      console.error('Error saving PII:', err);
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (piiData) {
      setEditedData(JSON.parse(JSON.stringify(piiData))); // Reset to original data
      setHasChanges(false);
      setError(null);
      setSuccess(null);
    }
    // Always navigate back to dashboard
    router.push('/dashboard');
  };

  const formatFieldName = (fieldName: string) => {
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const isFieldUpdateable = (section: keyof UpdateableFieldsData, field: string): boolean => {
    return updateableFields?.[section]?.[field]?.updateable || false;
  };

  const formatSSN = (ssn: string) => {
    if (!ssn) return '';
    if (showSSN) {
      // Show full SSN when toggled
      return ssn.replace(/(\d{3})(\d{2})(\d{4})/, '$1-$2-$3');
    }
    // Show masked SSN
    return '***-**-****';
  };

  // Format values to be human-readable
  const formatValue = (field: string, value: any): string => {
    if (!value) return '';
    
    switch (field) {
      case 'tax_id_type':
        return value.replace('_', ' ').toUpperCase();
      case 'funding_source':
        if (Array.isArray(value)) {
          return value.map((source: string) => 
            source.split('_').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ')
          ).join(', ');
        }
        return value.split('_').map((word: string) => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      case 'country_of_citizenship':
      case 'country_of_birth':
      case 'country_of_tax_residence':
        return value.toUpperCase();
      case 'date_of_birth':
        // Format date to be more readable
        try {
          const date = new Date(value);
          return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
        } catch {
          return value;
        }
      default:
        // For other fields, just convert underscores to spaces and capitalize
        if (typeof value === 'string') {
          return value.split('_').map((word: string) => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
        }
        return String(value);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!piiData || !editedData || !updateableFields) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center space-x-4 mb-6">
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Failed to load your account information. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Update Personal Information</h1>
            <p className="text-muted-foreground">
              View and update your account information. Data is loaded from your onboarding information.
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-6">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Contact Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Contact Information
            <Badge variant="secondary">Some fields updateable</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(updateableFields.contact).map(([field, fieldInfo]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field} className="flex items-center gap-2">
                  {formatFieldName(field)}
                  {!fieldInfo.updateable && (
                    <Badge variant="outline" className="text-xs">
                      Read Only
                    </Badge>
                  )}
                </Label>
                {field === 'street_address' ? (
                  <Input
                    id={field}
                    value={Array.isArray(editedData.contact?.[field as keyof typeof editedData.contact]) 
                      ? (editedData.contact?.[field as keyof typeof editedData.contact] as string[])?.join('\n') || ''
                      : (editedData.contact?.[field as keyof typeof editedData.contact] as string) || ''
                    }
                    onChange={(e) => handleInputChange('contact', field, e.target.value)}
                    disabled={!fieldInfo.updateable}
                    className={`${!fieldInfo.updateable ? "bg-muted" : ""} ${
                      validationErrors[`contact.${field}`] ? "border-red-500" : ""
                    }`}
                    placeholder={field === 'street_address' ? "Enter street address (one line per address line)" : ""}
                  />
                ) : (
                  <Input
                    id={field}
                    type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                    value={editedData.contact?.[field as keyof typeof editedData.contact] as string || ''}
                    onChange={(e) => handleInputChange('contact', field, e.target.value)}
                    disabled={!fieldInfo.updateable}
                    className={`${!fieldInfo.updateable ? "bg-muted" : ""} ${
                      validationErrors[`contact.${field}`] ? "border-red-500" : ""
                    }`}
                    placeholder={
                      field === 'email' ? 'Enter email address' :
                      field === 'phone' ? 'Enter phone number' :
                      field === 'postal_code' ? 'Enter ZIP code' :
                      `Enter ${formatFieldName(field).toLowerCase()}`
                    }
                  />
                )}
                {validationErrors[`contact.${field}`] && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors[`contact.${field}`]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Identity Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Identity Information
            <Badge variant="outline">Read Only</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Identity information cannot be updated after account creation due to regulatory requirements. 
              Contact support if you need to make changes to these fields.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(updateableFields.identity).map(([field, fieldInfo]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`identity-${field}`} className="flex items-center gap-2">
                  {formatFieldName(field)}
                  <Badge variant="outline" className="text-xs">Read Only</Badge>
                  {field === 'tax_id' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSSN(!showSSN)}
                      className="h-6 w-6 p-0 ml-auto"
                    >
                      {showSSN ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  )}
                </Label>
                <Input
                  id={`identity-${field}`}
                  value={field === 'tax_id' 
                    ? formatSSN(editedData.identity?.[field as keyof typeof editedData.identity] as string || '')
                    : formatValue(field, editedData.identity?.[field as keyof typeof editedData.identity])
                  }
                  disabled={true}
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">{fieldInfo.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Disclosures */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Regulatory Disclosures
            <Badge variant="outline">Read Only</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Disclosure responses cannot be updated after account creation. Contact support if your circumstances have changed.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(updateableFields.disclosures).map(([field, fieldInfo]) => (
              <div key={field} className="space-y-2">
                <Label className="flex items-center gap-2">
                  {formatFieldName(field)}
                  <Badge variant="outline" className="text-xs">Read Only</Badge>
                </Label>
                <Input
                  value={editedData.disclosures?.[field as keyof typeof editedData.disclosures] ? 'Yes' : 'No'}
                  disabled={true}
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">{fieldInfo.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input
                value={editedData.account_info?.account_number || ''}
                disabled={true}
                className="bg-muted font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Status</Label>
              <Input
                value={editedData.account_info?.status || ''}
                disabled={true}
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Created</Label>
              <Input
                value={editedData.account_info?.created_at ? new Date(editedData.account_info.created_at).toLocaleDateString() : ''}
                disabled={true}
                className="bg-muted"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons - Always show, but disable Save when no changes */}
      <div className="flex justify-end space-x-4">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges || Object.keys(validationErrors).length > 0}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {hasChanges && (
        <Alert className="mt-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to update your information in Alpaca or "Cancel" to discard changes.
          </AlertDescription>
        </Alert>
      )}
      <Toaster 
        position="bottom-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1f2937',
            color: '#fff',
            border: '1px solid #374151',
            borderRadius: '0.5rem',
            fontSize: '14px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
  );
} 