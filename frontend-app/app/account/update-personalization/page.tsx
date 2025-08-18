"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PersonalizationFormData } from "@/lib/types/personalization";
import { initialPersonalizationData } from "@/utils/services/personalization-data";
import { getPersonalizationData, saveOrUpdatePersonalizationData } from "@/utils/api/personalization-client";
import { PersonalizationFormComplete } from "@/components/onboarding/personalization/PersonalizationFormComplete";

export default function UpdatePersonalizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PersonalizationFormData>(initialPersonalizationData);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const existing = await getPersonalizationData();
        if (existing) {
          // Hydrate the form with existing values
          setFormData({
            firstName: existing.firstName || "",
            investmentGoals: existing.investmentGoals || [],
            riskTolerance: existing.riskTolerance || undefined,
            investmentTimeline: existing.investmentTimeline || undefined,
            experienceLevel: existing.experienceLevel || undefined,
            monthlyInvestmentGoal: existing.monthlyInvestmentGoal ?? initialPersonalizationData.monthlyInvestmentGoal,
            marketInterests: existing.marketInterests || [],
          });
        }
      } catch (error) {
        console.error('Error loading personalization data:', error);
        setError('Failed to load your current preferences');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUpdate = (updates: Partial<PersonalizationFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setError(null); // Clear any existing errors
  };

  const handleSubmit = async () => {
    try {
      const result = await saveOrUpdatePersonalizationData(formData);
      if (!result.success) {
        setError(result.error || 'Failed to save changes. Please try again.');
        return;
      }
      router.push('/dashboard?updated=personalization');
    } catch (error) {
      console.error('Error saving personalization data:', error);
      setError('Failed to save changes. Please try again.');
    }
  };

  const handleCancel = () => {
    router.push('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="flex items-center gap-2 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>

      <div className="py-8 px-4">
        {error && (
          <div className="max-w-4xl mx-auto mb-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        <PersonalizationFormComplete
          data={formData}
          onUpdate={handleUpdate}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitButtonText="Save Changes"
          title="Update Your Investment Preferences"
        />
      </div>
    </div>
  );
}