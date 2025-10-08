/**
 * Reusable form field component for PII data
 * Handles input rendering, validation, and formatting
 */

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatValue, isFieldUpdateable, getFieldDescription } from '@/lib/utils/pii-helpers';
import { validateField } from '@/lib/validation';
import { ValidationErrors } from '@/lib/validation';
import { PhoneInput } from '@/components/ui/phone-input';
import { isValidPhoneNumber } from 'react-phone-number-input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon, AlertTriangle } from "lucide-react";

interface PIIFormFieldProps {
  section: string;
  field: string;
  value: any;
  updateableFields: any;
  validationErrors: ValidationErrors;
  onChange: (section: string, field: string, value: any) => void;
  showSSN?: boolean;
  onToggleSSN?: () => void;
}

// Format postal code to support both 5-digit and 9-digit ZIP codes
const formatPostalCode = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
};

export const PIIFormField: React.FC<PIIFormFieldProps> = ({
  section,
  field,
  value,
  updateableFields,
  validationErrors,
  onChange,
  showSSN = false,
  onToggleSSN,
}) => {
  const fieldPath = `${section}.${field}`;
  const isUpdateable = isFieldUpdateable(updateableFields, section, field);
  const description = getFieldDescription(updateableFields, section, field);
  const error = validationErrors[fieldPath];
  const isReadOnly = !isUpdateable;

  // Track email changes for highlighting
  const [originalEmail, setOriginalEmail] = useState<string>('');
  const [emailChanged, setEmailChanged] = useState(false);

  // Initialize original email value
  useEffect(() => {
    if (section === 'contact' && field === 'email' && value && !originalEmail) {
      setOriginalEmail(value);
    }
  }, [section, field, value, originalEmail]);

  // Handle input change with validation and formatting
  const handleChange = (newValue: any) => {
    if (isReadOnly) return;
    
    let formattedValue = newValue;
    
    // Check for email changes
    if (section === 'contact' && field === 'email') {
      setEmailChanged(Boolean(originalEmail && newValue !== originalEmail));
    }
    
    // Apply formatting based on field type
    if (field === 'postal_code') {
      formattedValue = formatPostalCode(newValue);
    }
    
    // Call the parent onChange handler
    onChange(section, field, formattedValue);
  };

  // Render different input types
  const renderInput = () => {
    const commonProps = {
      id: fieldPath,
      value: value || '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => 
        handleChange(e.target.value),
      disabled: isReadOnly,
      className: `w-full ${error ? 'border-red-500' : ''} ${isReadOnly ? 'bg-gray-50' : ''}`,
    };

    // Special handling for SSN field
    if (field === 'tax_id') {
      return (
        <div className="relative">
          <Input
            {...commonProps}
            type={showSSN ? 'text' : 'password'}
            value={showSSN ? value : '•••••••••'}
            readOnly={!showSSN}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 transform -translate-y-1/2"
            onClick={onToggleSSN}
          >
            {showSSN ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      );
    }

    // Special handling for email field with change warning
    if (section === 'contact' && field === 'email') {
      return (
        <div className="space-y-2">
          <Input
            {...commonProps}
            type="email"
            placeholder="you@example.com"
            className={`w-full ${error ? 'border-red-500' : ''} ${isReadOnly ? 'bg-gray-50' : ''} ${emailChanged ? 'border-orange-400' : ''}`}
          />
          {emailChanged && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
              <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
              <p className="text-sm text-orange-800">
                Updates to email address will also change sign in credentials.
              </p>
            </div>
          )}
        </div>
      );
    }
    
    // Special handling for phone field with PhoneInput component
    if (field === 'phone') {
      return (
        <PhoneInput
          id={fieldPath}
          defaultCountry="US"
          value={value || ''}
          onChange={(phoneValue) => handleChange(phoneValue)}
          disabled={isReadOnly}
          className={`${error ? 'border-red-500' : ''} ${isReadOnly ? 'bg-gray-50' : ''}`}
        />
      );
    }

    // Special handling for postal code with numeric input mode
    if (field === 'postal_code') {
      return (
        <Input
          {...commonProps}
          type="text"
          inputMode="numeric"
          pattern="[0-9\-]*"
          placeholder="12345 or 12345-6789"
          maxLength={10} // xxxxx-xxxx
          autoComplete="postal-code"
        />
      );
    }

    // Special handling for street address (array)
    if (field === 'street_address') {
      const addressValue = Array.isArray(value) ? value.join('\n') : value || '';
      return (
        <Textarea
          {...commonProps}
          value={addressValue}
          onChange={(e) =>
            handleChange(
              e.target.value
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
            )
          }
          rows={3}
          placeholder="Enter street address"
        />
      );
    }

    // Special handling for funding source (array)
    if (field === 'funding_source') {
      const fundingValue = Array.isArray(value) ? value.join(', ') : value || '';
      return (
        <Input
          {...commonProps}
          value={fundingValue}
          onChange={(e) => handleChange(e.target.value.split(',').map(s => s.trim()).filter(s => s))}
          placeholder="Enter funding sources (comma-separated)"
        />
      );
    }

    // Special handling for date fields
    if (field === 'date_of_birth') {
      return (
        <Input
          {...commonProps}
          type="date"
          value={value || ''}
        />
      );
    }

    // Default text input
    return (
      <Input
        {...commonProps}
        type="text"
        placeholder={`Enter ${field.replace(/_/g, ' ')}`}
      />
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={fieldPath} className="text-sm font-medium">
          {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </Label>
        <div className="flex items-center gap-2">
          {!isUpdateable && (
            <Badge variant="secondary" className="text-xs">
              Read Only
            </Badge>
          )}
          {description && (
            <span className="text-xs text-gray-500">{description}</span>
          )}
        </div>
      </div>
      
      {renderInput()}
      
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}; 