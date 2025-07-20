/**
 * Reusable form field component for PII data
 * Handles input rendering, validation, and formatting
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatValue, isFieldUpdateable, getFieldDescription } from '@/lib/utils/pii-helpers';
import { validateField } from '@/lib/validation';
import { ValidationErrors } from '@/lib/validation';

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

  // Handle input change
  const handleChange = (newValue: any) => {
    if (isReadOnly) return;
    onChange(section, field, newValue);
  };

  // Render different input types
  const renderInput = () => {
    const commonProps = {
      id: fieldPath, // Add id for label association
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

    // Special handling for street address (array)
    if (field === 'street_address') {
      const addressValue = Array.isArray(value) ? value.join('\n') : value || '';
      return (
        <Textarea
          {...commonProps}
          value={addressValue}
          onChange={(e) => handleChange(e.target.value.split('\n').filter(line => line.trim()))}
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
      
      {isReadOnly && (
        <p className="text-xs text-gray-500">
          This field cannot be modified after account creation
        </p>
      )}
    </div>
  );
}; 