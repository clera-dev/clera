/**
 * Validation utilities for form fields
 * Extracted from UpdateInformationPage to follow separation of concerns
 */

export interface ValidationErrors {
  [key: string]: string;
}

// Email validation
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Phone validation - allows multiple formats
export const validatePhone = (phone: string): boolean => {
  // Allow formats: +1-234-567-8900, (234) 567-8900, 234-567-8900, 2345678900
  const phoneRegex = /^(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

// US Postal code validation
export const validatePostalCode = (postalCode: string): boolean => {
  // US ZIP codes: 12345 or 12345-6789
  const postalRegex = /^\d{5}(-\d{4})?$/;
  return postalRegex.test(postalCode);
};

// Required field validation
export const validateRequired = (value: string): boolean => {
  return value.trim().length > 0;
};

// Field-specific validation
export const validateField = (section: string, field: string, value: any): string | null => {
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
        return value.length > 0 && value.some(addr => addr.trim().length > 0) 
          ? null 
          : 'Street address is required';
      }
      return validateRequired(value) ? null : 'Street address is required';
    default:
      return validateRequired(value) ? null : `${formatFieldName(field)} is required`;
  }
};

// Validate all fields in a form
export const validateAllFields = (data: any, requiredFields: string[]): ValidationErrors => {
  const errors: ValidationErrors = {};
  
  requiredFields.forEach(fieldPath => {
    const [section, field] = fieldPath.split('.');
    const value = data[section]?.[field];
    const error = validateField(section, field, value);
    if (error) {
      errors[fieldPath] = error;
    }
  });
  
  return errors;
};

// Helper function to format field names for display
export const formatFieldName = (fieldName: string): string => {
  return fieldName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Check if form has validation errors
export const hasValidationErrors = (errors: ValidationErrors): boolean => {
  return Object.keys(errors).length > 0;
}; 