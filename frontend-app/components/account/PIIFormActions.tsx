/**
 * PII Form Actions component
 * Handles save, cancel, and other form actions
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Save, X } from 'lucide-react';

interface PIIFormActionsProps {
  hasChanges: boolean;
  saving: boolean;
  hasValidationErrors: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export const PIIFormActions: React.FC<PIIFormActionsProps> = ({
  hasChanges,
  saving,
  hasValidationErrors,
  onSave,
  onCancel,
}) => {
  return (
    <div className="flex items-center justify-end gap-4 pt-6 border-t">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={saving}
      >
        <X className="h-4 w-4 mr-2" />
        Cancel
      </Button>
      
      <Button
        type="button"
        onClick={onSave}
        disabled={saving || !hasChanges || hasValidationErrors}
        className={`min-w-[120px] ${hasChanges && !hasValidationErrors ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
      >
        {saving ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
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
  );
}; 