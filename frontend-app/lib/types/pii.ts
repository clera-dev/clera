/**
 * PII (Personally Identifiable Information) TypeScript interfaces
 * Centralized type definitions for PII data management
 */

// Import existing onboarding data structure to avoid duplication
import { OnboardingData } from '@/components/onboarding/OnboardingTypes';

// PII data structure from Alpaca API
export interface PIIData {
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

// Updateable fields configuration
export interface UpdateableFieldsData {
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

// Form section types
export type FormSection = 'contact' | 'identity' | 'disclosures';

// API response types
export interface PIIApiResponse {
  success: boolean;
  data?: PIIData;
  error?: string;
}

export interface UpdateableFieldsApiResponse {
  success: boolean;
  data?: UpdateableFieldsData;
  error?: string;
  notice?: string;
}

export interface UpdatePIIApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  updated_fields?: string[];
  details?: string;
} 