"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertCircle, CheckCircle, Info } from "lucide-react";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";

// Import modular components and utilities
import { usePIIData } from "@/hooks/usePIIData";
import { PIISection } from "@/components/account/PIISection";
import { PIIFormActions } from "@/components/account/PIIFormActions";
import { validateAllFields, hasValidationErrors, ValidationErrors } from "@/lib/validation";
import { getRequiredFields } from "@/lib/utils/pii-helpers";

export default function UpdateInformationPage() {
  const router = useRouter();
  const [showSSN, setShowSSN] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Use the custom hook for data management
  const {
    loading,
    saving,
    piiData,
    updateableFields,
    editedData,
    hasChanges,
    error,
    success,
    handleInputChange,
    handleSave,
    handleCancel,
    clearError,
    clearSuccess,
  } = usePIIData();

  // Handle form validation
  const validateForm = () => {
    if (!editedData) return false;
    
    const requiredFields = getRequiredFields();
    const errors = validateAllFields(editedData, requiredFields);
    setValidationErrors(errors);
    
    return !hasValidationErrors(errors);
  };

  // Handle save with validation
  const handleSaveWithValidation = async () => {
    if (!validateForm()) {
      toast.error('Please fix validation errors before saving');
      return;
    }

    try {
      await handleSave();
      toast.success('Account information updated successfully');
    } catch (err) {
      toast.error('Failed to update account information');
    }
  };

  // Handle cancel
  const handleCancelWithReset = () => {
    handleCancel();
    setValidationErrors({});
    setShowSSN(false);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !piiData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Update Account Information</h1>
            <p className="text-gray-600">Manage your personal and contact information</p>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <Alert className="mb-6">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Information Notice */}
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Some fields cannot be modified after account creation due to regulatory requirements. 
          Contact support if you need to make changes to non-updateable fields.
        </AlertDescription>
      </Alert>

      {/* PII Form */}
      {editedData && (
        <div className="space-y-8">
          {/* Contact Information Section */}
          <PIISection
            title="Contact Information"
            section="contact"
            data={editedData}
            updateableFields={updateableFields}
            validationErrors={validationErrors}
            onChange={handleInputChange}
          />

          {/* Identity Information Section */}
          <PIISection
            title="Personal Information"
            section="identity"
            data={editedData}
            updateableFields={updateableFields}
            validationErrors={validationErrors}
            onChange={handleInputChange}
            showSSN={showSSN}
            onToggleSSN={() => setShowSSN(!showSSN)}
          />

          {/* Disclosures Section */}
          <PIISection
            title="Disclosures"
            section="disclosures"
            data={editedData}
            updateableFields={updateableFields}
            validationErrors={validationErrors}
            onChange={handleInputChange}
          />

          {/* Form Actions */}
          <PIIFormActions
            hasChanges={hasChanges}
            saving={saving}
            hasValidationErrors={hasValidationErrors(validationErrors)}
            onSave={handleSaveWithValidation}
            onCancel={handleCancelWithReset}
          />
        </div>
      )}
    </div>
  );
} 