/**
 * PII Section component
 * Groups related PII fields into logical sections
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PIIFormField } from './PIIFormField';
import { PIIData, UpdateableFieldsData } from '@/lib/types/pii';
import { ValidationErrors } from '@/lib/validation';

interface PIISectionProps {
  title: string;
  section: keyof PIIData;
  data: any;
  updateableFields: UpdateableFieldsData | null;
  validationErrors: ValidationErrors;
  onChange: (section: string, field: string, value: any) => void;
  showSSN?: boolean;
  onToggleSSN?: () => void;
}

export const PIISection: React.FC<PIISectionProps> = ({
  title,
  section,
  data,
  updateableFields,
  validationErrors,
  onChange,
  showSSN = false,
  onToggleSSN,
}) => {
  if (!data) return null;

  const sectionData = data[section];
  if (!sectionData) return null;

  const fields = Object.keys(sectionData);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {fields.map((field) => (
            <PIIFormField
              key={`${section}.${field}`}
              section={section}
              field={field}
              value={sectionData[field]}
              updateableFields={updateableFields}
              validationErrors={validationErrors}
              onChange={onChange}
              showSSN={showSSN}
              onToggleSSN={onToggleSSN}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}; 