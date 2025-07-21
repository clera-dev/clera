/**
 * PII data utility functions
 * Helper functions for formatting and converting PII data
 */

import { OnboardingData } from '@/lib/types/onboarding';
import { PIIData } from '@/lib/types/pii';

// Convert Supabase onboarding data to PII format
export const convertOnboardingToPII = (onboardingData: OnboardingData, accountInfo: any): PIIData => {
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

// Format SSN for display (mask sensitive parts)
export const formatSSN = (ssn: string): string => {
  if (!ssn) return '';
  
  // Remove all non-digit characters
  const cleaned = ssn.replace(/\D/g, '');
  
  if (cleaned.length === 0) {
    return '';
  }
  
  // Always mask sensitive parts, even for partial SSNs
  if (cleaned.length >= 4) {
    // Full SSN: show only last 4 digits
    return `***-**-${cleaned.slice(-4)}`;
  } else if (cleaned.length >= 2) {
    // Partial SSN: show only last 2 digits, mask the rest
    return `***-${cleaned.slice(-2)}`;
  } else {
    // Very short SSN: show only last digit, mask the rest
    return `***-*-${cleaned}`;
  }
};

// Format field values for display
export const formatValue = (field: string, value: any): string => {
  if (!value) return '';
  
  switch (field) {
    case 'tax_id':
      return formatSSN(value);
    case 'street_address':
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return value;
    case 'funding_source':
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return value;
    case 'date_of_birth':
      // Format date for display
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    default:
      return String(value);
  }
};

// Check if a field is updateable
export const isFieldUpdateable = (
  updateableFields: any, 
  section: string, 
  field: string
): boolean => {
  return updateableFields?.[section]?.[field]?.updateable || false;
};

// Get field description
export const getFieldDescription = (
  updateableFields: any, 
  section: string, 
  field: string
): string => {
  return updateableFields?.[section]?.[field]?.description || '';
};

// Deep compare two objects to detect changes
export const hasChanges = (original: any, current: any): boolean => {
  // If one is undefined/null and the other isn't, there's a change
  if (!original && current) return true;
  if (original && !current) return true;
  
  // If both are undefined/null, no change
  if (!original && !current) return false;
  
  const stringify = (obj: any) => JSON.stringify(obj, Object.keys(obj).sort());
  return stringify(original) !== stringify(current);
};

// Get required fields for validation
export const getRequiredFields = (): string[] => {
  return [
    'contact.email',
    'contact.phone',
    'contact.street_address',
    'contact.city',
    'contact.state',
    'contact.postal_code',
  ];
}; 