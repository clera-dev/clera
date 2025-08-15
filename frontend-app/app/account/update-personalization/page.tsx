"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  PersonalizationFormData,
  InvestmentGoal,
  RiskTolerance,
  InvestmentTimeline,
  ExperienceLevel,
  MarketInterest,
  INVESTMENT_GOAL_DESCRIPTIONS,
  RISK_TOLERANCE_DESCRIPTIONS,
  INVESTMENT_TIMELINE_DESCRIPTIONS,
  EXPERIENCE_LEVEL_DESCRIPTIONS,
  MARKET_INTEREST_DESCRIPTIONS,
  validatePersonalizationData,
  initialPersonalizationData,
} from "@/lib/types/personalization";
import { Check, Rocket, Smile, Shield, ArrowLeft } from "lucide-react";
import { getPersonalizationData, saveOrUpdatePersonalizationData } from "@/utils/api/personalization-client";

export default function UpdatePersonalizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PersonalizationFormData>(initialPersonalizationData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [tempTimelineIndex, setTempTimelineIndex] = useState<number | null>(null);
  const [tempMonthlyValue, setTempMonthlyValue] = useState<number | null>(null);

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
            riskTolerance: existing.riskTolerance as RiskTolerance | undefined,
            investmentTimeline: existing.investmentTimeline as InvestmentTimeline | undefined,
            experienceLevel: existing.experienceLevel as ExperienceLevel | undefined,
            monthlyInvestmentGoal: existing.monthlyInvestmentGoal ?? 250,
            marketInterests: existing.marketInterests || [],
          });
        }
      } catch (e) {
        console.error("Failed to load personalization data:", e);
        setError("Failed to load personalization data. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateForm = (updates: Partial<PersonalizationFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Validate before saving
    const validation = validatePersonalizationData(formData);
    const mapped: Record<string, string> = {};
    for (const err of validation.errors) {
      const lower = err.toLowerCase();
      if (lower.includes("first name")) mapped.firstName = err;
      else if (lower.includes("goal")) mapped.investmentGoals = err;
      else if (lower.includes("risk")) mapped.riskTolerance = err;
      else if (lower.includes("timeline")) mapped.investmentTimeline = err;
      else if (lower.includes("experience")) mapped.experienceLevel = err;
      else if (lower.includes("interest")) mapped.marketInterests = err;
    }
    setFieldErrors(mapped);

    if (!validation.isValid) {
      setSaving(false);
      // Scroll to first error
      const order = [
        "firstName",
        "investmentGoals",
        "riskTolerance",
        "investmentTimeline",
        "experienceLevel",
        "monthlyInvestmentGoal",
        "marketInterests",
      ];
      const first = order.find((k) => mapped[k]);
      if (first) {
        const el = document.querySelector(`[data-field="${first}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    try {
      const result = await saveOrUpdatePersonalizationData(formData);
      if (result.success) {
        router.push("/dashboard");
      } else {
        setError(result.error || "Failed to save updates");
      }
    } catch (e) {
      console.error("Save failed:", e);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const selectedTimelineIndex = useMemo(() => {
    if (!formData.investmentTimeline) return 2;
    const entries = Object.entries(INVESTMENT_TIMELINE_DESCRIPTIONS);
    const idx = entries.findIndex(([key]) => key === formData.investmentTimeline);
    return idx >= 0 ? idx : 2;
  }, [formData.investmentTimeline]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <div className="h-10 w-40 bg-muted animate-pulse rounded mb-6" />
        <div className="h-6 w-72 bg-muted animate-pulse rounded mb-2" />
        <div className="h-2 w-full bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Update Your Personalization</h1>
        <p className="text-muted-foreground mt-1">Adjust anything you like. Changes will improve your personalized guidance.</p>
      </div>

      {/* Name */}
      <div data-field="firstName" className="space-y-4 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <Label className="text-lg font-semibold">What's your name?</Label>
        <Input
          value={formData.firstName || ""}
          onChange={(e) => {
            const raw = e.target.value;
            const stripped = raw.replace(/[0-9]/g, "");
            updateForm({ firstName: stripped });
            const { errors } = validatePersonalizationData({ ...formData, firstName: stripped });
            const firstErr = errors.find((er) => er.toLowerCase().includes("first name"));
            setFieldErrors((prev) => ({ ...prev, firstName: firstErr || "" }));
          }}
          placeholder="First name"
          className={cn("max-w-md", fieldErrors.firstName && "border-red-500")}
        />
        {fieldErrors.firstName && <p className="text-red-500 text-sm">{fieldErrors.firstName}</p>}
      </div>

      {/* Goals */}
      <div data-field="investmentGoals" className="space-y-4 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <Label className="text-lg font-semibold">What investing goals can I help you achieve?</Label>
        <p className="text-sm text-muted-foreground">Select all that apply</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(INVESTMENT_GOAL_DESCRIPTIONS).map(([goal, description]) => {
            const isSelected = formData.investmentGoals?.includes(goal as InvestmentGoal);
            return (
              <Card
                key={goal}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                )}
                onClick={() => {
                  const current = formData.investmentGoals || [];
                  if (isSelected) {
                    const updated = current.filter((g) => g !== goal);
                    updateForm({ investmentGoals: updated });
                    setFieldErrors((prev) => ({ ...prev, investmentGoals: updated.length > 0 ? "" : prev.investmentGoals }));
                  } else if (current.length < 5) {
                    const updated = [...current, goal as InvestmentGoal];
                    updateForm({ investmentGoals: updated });
                    setFieldErrors((prev) => ({ ...prev, investmentGoals: "" }));
                  }
                }}
              >
                <CardContent className="p-4 flex items-center justify-between min-h-[60px]">
                  <span className="text-sm font-medium">{description}</span>
                  {isSelected && <Check className="h-5 w-5 text-primary flex-shrink-0 ml-2" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {fieldErrors.investmentGoals && <p className="text-red-500 text-sm">{fieldErrors.investmentGoals}</p>}
      </div>

      {/* Risk Tolerance */}
      <div data-field="riskTolerance" className="space-y-4 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <Label className="text-lg font-semibold">Imagine your portfolio drops by 20% in a single month. Which best describes your reaction?</Label>
        <div className="grid grid-cols-1 gap-4">
          {Object.entries(RISK_TOLERANCE_DESCRIPTIONS).map(([tolerance, description]) => {
            const isSelected = formData.riskTolerance === tolerance;
            const icon = tolerance === "conservative" ? (
              <Shield className="h-6 w-6 text-amber-600" />
            ) : tolerance === "moderate" ? (
              <Smile className="h-6 w-6 text-blue-500" />
            ) : (
              <Rocket className="h-6 w-6 text-green-500" />
            );
            return (
              <Card
                key={tolerance}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                )}
                onClick={() => {
                  updateForm({ riskTolerance: tolerance as RiskTolerance });
                  setFieldErrors((prev) => ({ ...prev, riskTolerance: "" }));
                }}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  {icon}
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize mb-1">
                      {tolerance === "conservative" ? "Conservative" : tolerance === "moderate" ? "Moderate" : "Aggressive/Risky"}
                    </p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  {isSelected && <Check className="h-5 w-5 text-primary flex-shrink-0" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {fieldErrors.riskTolerance && <p className="text-red-500 text-sm">{fieldErrors.riskTolerance}</p>}
      </div>

      {/* Timeline */}
      <div data-field="investmentTimeline" className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <Label className="text-lg font-semibold">How long do you plan to be investing for?</Label>
        <div className="space-y-4">
          <Slider
            value={[tempTimelineIndex !== null ? tempTimelineIndex : selectedTimelineIndex]}
            onValueChange={([v]) => setTempTimelineIndex(v)}
            onValueCommit={([v]) => {
              const key = Object.keys(INVESTMENT_TIMELINE_DESCRIPTIONS)[v] as InvestmentTimeline;
              setTempTimelineIndex(v);
              updateForm({ investmentTimeline: key });
              setFieldErrors((prev) => ({ ...prev, investmentTimeline: "" }));
            }}
            max={Object.keys(INVESTMENT_TIMELINE_DESCRIPTIONS).length - 1}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-muted-foreground px-2">
            {Object.values(INVESTMENT_TIMELINE_DESCRIPTIONS).map((d, i) => (
              <span key={i} className={cn("text-center flex-1 transition-colors", (tempTimelineIndex ?? selectedTimelineIndex) === i && "text-primary font-medium")}>{d}</span>
            ))}
          </div>
        </div>
        {fieldErrors.investmentTimeline && <p className="text-red-500 text-sm">{fieldErrors.investmentTimeline}</p>}
      </div>

      {/* Experience */}
      <div data-field="experienceLevel" className="space-y-4 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <Label className="text-lg font-semibold">How familiar are you with investing and financial markets?</Label>
        <div className="grid grid-cols-1 gap-3">
          {Object.entries(EXPERIENCE_LEVEL_DESCRIPTIONS).map(([level, description]) => {
            const isSelected = formData.experienceLevel === level;
            return (
              <Card
                key={level}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                )}
                onClick={() => {
                  updateForm({ experienceLevel: level as ExperienceLevel });
                  setFieldErrors((prev) => ({ ...prev, experienceLevel: "" }));
                }}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <p className="text-sm font-medium">{description}</p>
                  {isSelected && <Check className="h-5 w-5 text-primary flex-shrink-0 ml-2" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {fieldErrors.experienceLevel && <p className="text-red-500 text-sm">{fieldErrors.experienceLevel}</p>}
      </div>

      {/* Monthly Goal */}
      <div data-field="monthlyInvestmentGoal" className="space-y-6 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <Label className="text-lg font-semibold">Do you have a goal for how much you want to invest on a monthly basis?</Label>
        <p className="text-sm text-muted-foreground">This is for information purposes only. I will never withdraw money from your account without your prior direction.</p>
        <div className="space-y-4">
          <Slider
            value={[tempMonthlyValue !== null ? tempMonthlyValue : (typeof formData.monthlyInvestmentGoal === "number" && formData.monthlyInvestmentGoal > 0 ? formData.monthlyInvestmentGoal : 250)]}
            onValueChange={([val]) => setTempMonthlyValue(val)}
            onValueCommit={([val]) => {
              const snapped = (() => {
                if (val <= 1) return 1;
                const rounded = Math.round(val / 25) * 25;
                return Math.min(1000, Math.max(25, rounded));
              })();
              setTempMonthlyValue(snapped);
              updateForm({ monthlyInvestmentGoal: snapped });
            }}
            max={1000}
            min={1}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>$1</span>
            <span>$500</span>
            <span>$1,000+</span>
          </div>
          <div className="text-center p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-xl font-bold text-primary">
              ${tempMonthlyValue !== null ? tempMonthlyValue : formData.monthlyInvestmentGoal}{(tempMonthlyValue ?? formData.monthlyInvestmentGoal ?? 0) >= 1000 ? "+" : ""}
            </p>
            <p className="text-sm text-muted-foreground">per month</p>
          </div>
        </div>
      </div>

      {/* Interests */}
      <div data-field="marketInterests" className="space-y-4 bg-card/50 p-6 rounded-lg border border-border/30 shadow-sm">
        <Label className="text-lg font-semibold">What kind of industries, investments,or market news are you interested in?</Label>
        <p className="text-sm text-muted-foreground">Select up to 5</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(MARKET_INTEREST_DESCRIPTIONS).map(([interest, description]) => {
            const isSelected = formData.marketInterests?.includes(interest as MarketInterest);
            return (
              <Card
                key={interest}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                )}
                onClick={() => {
                  const current = formData.marketInterests || [];
                  if (isSelected) {
                    const updated = current.filter((i) => i !== interest);
                    updateForm({ marketInterests: updated });
                    setFieldErrors((prev) => ({ ...prev, marketInterests: updated.length > 0 ? "" : "Please select at least one market or investment interest" }));
                  } else if (current.length < 5) {
                    const updated = [...current, interest as MarketInterest];
                    updateForm({ marketInterests: updated });
                    setFieldErrors((prev) => ({ ...prev, marketInterests: "" }));
                  }
                }}
              >
                <CardContent className="p-3 flex items-center justify-between min-h-[60px]">
                  <span className="text-sm font-medium text-center w-full">{description}</span>
                  {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0 ml-1" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {fieldErrors.marketInterests && <p className="text-red-500 text-sm">{fieldErrors.marketInterests}</p>}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm font-medium">Error: {error}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving} className="bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}


