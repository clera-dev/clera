"use client";

import React, { useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";

// Risk profiles with return rates and allocations
type RiskLevel = 'conservative' | 'balanced' | 'aggressive';

const RISK_PROFILES: Record<RiskLevel, {
  rate: number;
  label: string;
  allocation: { name: string; value: number; color: string }[];
}> = {
  conservative: {
    rate: 0.06,
    label: 'Conservative',
    allocation: [
      { name: 'Stocks', value: 30, color: '#3b82f6' },
      { name: 'Bonds', value: 50, color: '#6b7280' },
      { name: 'Cash', value: 20, color: '#9ca3af' },
    ],
  },
  balanced: {
    rate: 0.08,
    label: 'Balanced',
    allocation: [
      { name: 'Stocks', value: 60, color: '#3b82f6' },
      { name: 'Bonds', value: 30, color: '#6b7280' },
      { name: 'Alternatives', value: 10, color: '#22d3ee' },
    ],
  },
  aggressive: {
    rate: 0.10,
    label: 'Aggressive',
    allocation: [
      { name: 'Stocks', value: 80, color: '#3b82f6' },
      { name: 'Bonds', value: 15, color: '#6b7280' },
      { name: 'Alternatives', value: 5, color: '#22d3ee' },
    ],
  },
};

// Average investor return - DALBAR 2023
const AVERAGE_INVESTOR_RATE = 0.0405; // 4.05%

// Value limits - V2 expanded ranges
const VALUE_LIMITS = {
  initialInvestment: {
    min: 1_000,
    max: 1_000_000,
    step: 1000,
    sliderMax: 250_000,
  },
  monthlyInvestment: {
    min: 0,
    max: 10_000,
    step: 100,
    sliderMax: 5_000,
  },
  timeHorizon: {
    min: 5,
    max: 40,
    step: 1,
  },
};

// Helper to format currency
const formatCurrency = (value: number | null | undefined, digits = 0): string => {
  if (value === null || value === undefined) return '$--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
};

// Helper to parse currency input
const parseCurrencyInput = (value: string): number => {
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Custom tooltip component
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    return (
      <div className="rounded-2xl border border-gray-800 bg-black/90 backdrop-blur-sm p-3 shadow-lg">
        <p className="text-sm text-gray-400 mb-2">Year {dataPoint.year}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400" />
            <span className="text-sm text-gray-300">With Clera:</span>
            <span className="text-sm font-bold text-white">{formatCurrency(dataPoint.clera)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500" />
            <span className="text-sm text-gray-300">Average Investor:</span>
            <span className="text-sm font-bold text-gray-400">{formatCurrency(dataPoint.average)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// Mini pie chart for allocation display
function AllocationPieChart({ allocation }: { allocation: { name: string; value: number; color: string }[] }) {
  return (
    <div className="flex items-center gap-4">
      <PieChart width={70} height={70}>
        <Pie
          data={allocation}
          cx={35}
          cy={35}
          innerRadius={18}
          outerRadius={32}
          dataKey="value"
          stroke="none"
        >
          {allocation.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
      <div className="text-xs text-gray-400 space-y-0.5">
        {allocation.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.name}: {item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparisonChart() {
  // V2 defaults
  const [initialInvestment, setInitialInvestment] = useState<number>(25000);
  const [monthlyInvestment, setMonthlyInvestment] = useState<number>(1000);
  const [timeHorizon, setTimeHorizon] = useState<number>(20);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('balanced');

  // Input field state
  const [initialInvestmentInput, setInitialInvestmentInput] = useState<string>(formatCurrency(25000));
  const [monthlyInvestmentInput, setMonthlyInvestmentInput] = useState<string>(formatCurrency(1000));
  const [timeHorizonInput, setTimeHorizonInput] = useState<string>('20');

  // Handlers
  const handleInitialInvestmentChange = useCallback((value: number) => {
    const clamped = Math.max(VALUE_LIMITS.initialInvestment.min,
                             Math.min(VALUE_LIMITS.initialInvestment.max, value));
    setInitialInvestment(clamped);
    setInitialInvestmentInput(formatCurrency(clamped));
  }, []);

  const handleMonthlyInvestmentChange = useCallback((value: number) => {
    const clamped = Math.max(VALUE_LIMITS.monthlyInvestment.min,
                             Math.min(VALUE_LIMITS.monthlyInvestment.max, value));
    setMonthlyInvestment(clamped);
    setMonthlyInvestmentInput(formatCurrency(clamped));
  }, []);

  const handleTimeHorizonChange = useCallback((value: number) => {
    const clamped = Math.max(VALUE_LIMITS.timeHorizon.min,
                             Math.min(VALUE_LIMITS.timeHorizon.max, value));
    setTimeHorizon(clamped);
    setTimeHorizonInput(clamped.toString());
  }, []);

  // Calculate projection data
  const projectionData = useMemo(() => {
    const data = [];
    let cleraValue = initialInvestment;
    let averageValue = initialInvestment;
    const currentYear = new Date().getFullYear();
    const annualInvestment = monthlyInvestment * 12;
    const cleraRate = RISK_PROFILES[riskLevel].rate;

    data.push({
      year: currentYear,
      clera: cleraValue,
      average: averageValue
    });

    for (let i = 1; i <= timeHorizon; i++) {
      // Add annual investment then apply growth
      cleraValue += annualInvestment;
      cleraValue *= (1 + cleraRate);

      averageValue += annualInvestment;
      averageValue *= (1 + AVERAGE_INVESTOR_RATE);

      data.push({
        year: currentYear + i,
        clera: cleraValue,
        average: averageValue
      });
    }
    return data;
  }, [initialInvestment, monthlyInvestment, timeHorizon, riskLevel]);

  const finalCleraValue = projectionData[projectionData.length - 1]?.clera ?? initialInvestment;
  const finalAverageValue = projectionData[projectionData.length - 1]?.average ?? initialInvestment;
  const advantageAmount = finalCleraValue - finalAverageValue;
  const advantagePercent = finalAverageValue > 0 ? ((finalCleraValue / finalAverageValue - 1) * 100) : 0;

  return (
    <section id="comparison" className="relative w-full bg-black py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              See the difference Clera makes.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Compare your potential returns with Clera&apos;s personalized guidance
              versus the average investor.
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Controls */}
          <BlurFade delay={0.2} inView>
            <div className="space-y-6 bg-gray-900/50 border border-gray-800 rounded-3xl p-6">
              {/* Starting Investment */}
              <div>
                <Label htmlFor="initialInvestment" className="text-sm font-medium text-gray-300">
                  Starting Investment
                </Label>
                <div className="flex gap-2 mt-2 items-center">
                  <Input
                    id="initialInvestmentInput"
                    type="text"
                    value={initialInvestmentInput}
                    onChange={(e) => setInitialInvestmentInput(e.target.value)}
                    onBlur={(e) => handleInitialInvestmentChange(parseCurrencyInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleInitialInvestmentChange(parseCurrencyInput(initialInvestmentInput));
                      }
                    }}
                    className="w-36 text-sm bg-black border-gray-700 text-white rounded-xl"
                    placeholder="$25,000"
                  />
                </div>
                <Slider
                  id="initialInvestment"
                  min={VALUE_LIMITS.initialInvestment.min}
                  max={VALUE_LIMITS.initialInvestment.sliderMax}
                  step={VALUE_LIMITS.initialInvestment.step}
                  value={[Math.min(initialInvestment, VALUE_LIMITS.initialInvestment.sliderMax)]}
                  onValueChange={(value: number[]) => handleInitialInvestmentChange(value[0])}
                  className="mt-3"
                />
              </div>

              {/* Monthly Contribution */}
              <div>
                <Label htmlFor="monthlyInvestment" className="text-sm font-medium text-gray-300">
                  Monthly Contribution
                </Label>
                <div className="flex gap-2 mt-2 items-center">
                  <Input
                    id="monthlyInvestmentInput"
                    type="text"
                    value={monthlyInvestmentInput}
                    onChange={(e) => setMonthlyInvestmentInput(e.target.value)}
                    onBlur={(e) => handleMonthlyInvestmentChange(parseCurrencyInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleMonthlyInvestmentChange(parseCurrencyInput(monthlyInvestmentInput));
                      }
                    }}
                    className="w-32 text-sm bg-black border-gray-700 text-white rounded-xl"
                    placeholder="$1,000"
                  />
                </div>
                <Slider
                  id="monthlyInvestment"
                  min={VALUE_LIMITS.monthlyInvestment.min}
                  max={VALUE_LIMITS.monthlyInvestment.sliderMax}
                  step={VALUE_LIMITS.monthlyInvestment.step}
                  value={[Math.min(monthlyInvestment, VALUE_LIMITS.monthlyInvestment.sliderMax)]}
                  onValueChange={(value: number[]) => handleMonthlyInvestmentChange(value[0])}
                  className="mt-3"
                />
              </div>

              {/* Time Horizon */}
              <div>
                <Label htmlFor="timeHorizon" className="text-sm font-medium text-gray-300">
                  Time Horizon
                </Label>
                <div className="flex gap-2 mt-2 items-center">
                  <Input
                    id="timeHorizonInput"
                    type="text"
                    value={timeHorizonInput}
                    onChange={(e) => setTimeHorizonInput(e.target.value)}
                    onBlur={(e) => {
                      const parsed = parseInt(e.target.value);
                      handleTimeHorizonChange(isNaN(parsed) ? 20 : parsed);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const parsed = parseInt(timeHorizonInput);
                        handleTimeHorizonChange(isNaN(parsed) ? 20 : parsed);
                      }
                    }}
                    className="w-20 text-sm bg-black border-gray-700 text-white rounded-xl"
                    placeholder="20"
                  />
                  <span className="text-sm text-gray-400">years</span>
                </div>
                <Slider
                  id="timeHorizon"
                  min={VALUE_LIMITS.timeHorizon.min}
                  max={VALUE_LIMITS.timeHorizon.max}
                  step={VALUE_LIMITS.timeHorizon.step}
                  value={[timeHorizon]}
                  onValueChange={(value: number[]) => handleTimeHorizonChange(value[0])}
                  className="mt-3"
                />
              </div>

              {/* Risk Level Toggle */}
              <div className="pt-4 border-t border-gray-800">
                <Label className="text-sm font-medium text-gray-300 mb-3 block">
                  Risk Profile
                </Label>
                <div className="flex gap-1 bg-gray-800/50 p-1 rounded-2xl">
                  {(['conservative', 'balanced', 'aggressive'] as RiskLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setRiskLevel(level)}
                      className={cn(
                        "flex-1 py-2 px-2 rounded-xl text-xs font-medium transition-all",
                        riskLevel === level
                          ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg"
                          : "text-gray-400 hover:text-gray-300"
                      )}
                    >
                      {RISK_PROFILES[level].label}
                    </button>
                  ))}
                </div>

                {/* Allocation Pie Chart */}
                <div className="mt-4 flex justify-center">
                  <AllocationPieChart allocation={RISK_PROFILES[riskLevel].allocation} />
                </div>

                <p className="text-xs text-gray-500 mt-3 text-center">
                  Expected return: {(RISK_PROFILES[riskLevel].rate * 100).toFixed(0)}% annually
                </p>
              </div>
            </div>
          </BlurFade>

          {/* Chart and Results */}
          <BlurFade delay={0.3} inView className="lg:col-span-2">
            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-6">
              {/* Results Summary */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-2xl p-4">
                  <p className="text-sm text-gray-400 mb-1">With Clera</p>
                  <div className="text-2xl sm:text-3xl font-bold text-white flex items-baseline">
                    $<NumberTicker value={Math.round(finalCleraValue)} className="text-white" />
                  </div>
                </div>
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4">
                  <p className="text-sm text-gray-400 mb-1">Average Investor</p>
                  <div className="text-2xl sm:text-3xl font-bold text-gray-400 flex items-baseline">
                    $<NumberTicker value={Math.round(finalAverageValue)} className="text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Advantage Badge */}
              <div className="mb-6 text-center">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full">
                  <span className="text-blue-400 font-semibold">Clera advantage:</span>
                  <span className="text-white font-bold">+{formatCurrency(advantageAmount)}</span>
                  <span className="text-cyan-400">(+{advantagePercent.toFixed(0)}%)</span>
                </span>
              </div>

              {/* Chart */}
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={projectionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="cleraGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#22d3ee" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis
                      dataKey="year"
                      stroke="#6b7280"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      orientation="right"
                      stroke="#6b7280"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => {
                        if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
                        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
                        return `$${value.toFixed(0)}`;
                      }}
                      width={55}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                    <Line
                      type="monotone"
                      dataKey="clera"
                      stroke="url(#cleraGradient)"
                      strokeWidth={3}
                      dot={false}
                      name="With Clera"
                    />
                    <Line
                      type="monotone"
                      dataKey="average"
                      stroke="#6b7280"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Average Investor"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Disclaimer */}
              <p className="text-xs text-gray-500 mt-4 text-center">
                Projections are hypothetical and for illustrative purposes only.
                Past performance does not guarantee future results.
                Average equity fund investor return: 4.05% over the past 3-year period. Source: DALBAR QAIB, 2023.
              </p>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
