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

// Risk profiles with return rates and professionally accurate allocations
type RiskLevel = 'conservative' | 'balanced' | 'aggressive';

// Clera Blue Color Palette
const COLORS = {
  // Stocks - Blue Gradient Family
  stocksLargeCap: '#1e40af',    // Dark Blue
  stocksMidCap: '#2563eb',      // Medium Blue
  stocksSmallCap: '#3b82f6',    // Blue
  stocksIntl: '#60a5fa',        // Light Blue
  stocksEmerging: '#22d3ee',    // Cyan
  // Bonds - Sky/Light Blue Family
  bondsInvestment: '#7dd3fc',   // Sky Blue
  bondsTreasury: '#bae6fd',     // Lighter Sky
  // Cash & Alternatives - Neutral
  cash: '#9ca3af',              // Gray 400
  alternatives: '#64748b',      // Slate 500
};

const RISK_PROFILES: Record<RiskLevel, {
  rate: number;
  label: string;
  description: string;
  allocation: { name: string; value: number; color: string }[];
  summary: { stocks: number; bonds: number; other: number };
}> = {
  conservative: {
    rate: 0.055, // 5-6% expected
    label: 'Conservative',
    description: '5-6% expected return',
    allocation: [
      { name: 'US Large Cap', value: 15, color: COLORS.stocksLargeCap },
      { name: 'US Mid/Small Cap', value: 5, color: COLORS.stocksMidCap },
      { name: 'International', value: 5, color: COLORS.stocksIntl },
      { name: 'Investment Grade Bonds', value: 40, color: COLORS.bondsInvestment },
      { name: 'Treasury Bonds', value: 20, color: COLORS.bondsTreasury },
      { name: 'Cash', value: 10, color: COLORS.cash },
      { name: 'Alternatives', value: 5, color: COLORS.alternatives },
    ],
    summary: { stocks: 25, bonds: 60, other: 15 },
  },
  balanced: {
    rate: 0.075, // 7-8% expected
    label: 'Balanced',
    description: '7-8% expected return',
    allocation: [
      { name: 'US Large Cap', value: 30, color: COLORS.stocksLargeCap },
      { name: 'US Mid Cap', value: 10, color: COLORS.stocksMidCap },
      { name: 'US Small Cap', value: 5, color: COLORS.stocksSmallCap },
      { name: 'International', value: 10, color: COLORS.stocksIntl },
      { name: 'Emerging Markets', value: 5, color: COLORS.stocksEmerging },
      { name: 'Investment Grade Bonds', value: 20, color: COLORS.bondsInvestment },
      { name: 'Treasury Bonds', value: 10, color: COLORS.bondsTreasury },
      { name: 'Cash', value: 5, color: COLORS.cash },
      { name: 'Alternatives', value: 5, color: COLORS.alternatives },
    ],
    summary: { stocks: 60, bonds: 30, other: 10 },
  },
  aggressive: {
    rate: 0.095, // 9-10% expected
    label: 'Aggressive',
    description: '9-10% expected return',
    allocation: [
      { name: 'US Large Cap', value: 34, color: COLORS.stocksLargeCap },
      { name: 'US Mid Cap', value: 15, color: COLORS.stocksMidCap },
      { name: 'US Small Cap', value: 10, color: COLORS.stocksSmallCap },
      { name: 'International', value: 14, color: COLORS.stocksIntl },
      { name: 'Emerging Markets', value: 10, color: COLORS.stocksEmerging },
      { name: 'Investment Grade Bonds', value: 5, color: COLORS.bondsInvestment },
      { name: 'Treasury Bonds', value: 5, color: COLORS.bondsTreasury },
      { name: 'Cash', value: 2, color: COLORS.cash },
      { name: 'Alternatives', value: 5, color: COLORS.alternatives },
    ],
    summary: { stocks: 83, bonds: 10, other: 7 },
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
      <div className="rounded-2xl border backdrop-blur-sm p-3 shadow-lg border-gray-800 bg-black/90">
        <p className="text-sm mb-2 text-gray-400">Year {dataPoint.year}</p>
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

// Mini donut chart for allocation display
function AllocationDonutChart({
  allocation,
  summary,
}: {
  allocation: { name: string; value: number; color: string }[];
  summary: { stocks: number; bonds: number; other: number };
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <PieChart width={150} height={150}>
          <Pie
            data={allocation}
            cx={75}
            cy={75}
            innerRadius={45}
            outerRadius={70}
            dataKey="value"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={1}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {allocation.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                opacity={activeIndex === null || activeIndex === index ? 1 : 0.5}
                style={{
                  transform: activeIndex === index ? 'scale(1.05)' : 'scale(1)',
                  transformOrigin: 'center',
                  transition: 'all 0.2s ease-out',
                }}
              />
            ))}
          </Pie>
        </PieChart>

        {/* Center text - show hovered segment or default */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {activeIndex !== null ? (
            <div className="text-center">
              <p className="text-lg font-bold text-white">{allocation[activeIndex].value}%</p>
              <p className="text-xs max-w-[70px] leading-tight text-gray-400">{allocation[activeIndex].name}</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs text-gray-500">Allocation</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary legend */}
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-600 to-blue-400" />
          <span className="text-gray-300">Stocks {summary.stocks}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-sky-300 to-sky-200" />
          <span className="text-gray-300">Bonds {summary.bonds}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
          <span className="text-gray-300">Other {summary.other}%</span>
        </div>
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
    <section id="comparison" className="relative w-full py-24 px-6 bg-black">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
              See the difference Clera makes.
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-gray-400">
              Compare your potential returns with Clera&apos;s personalized guidance
              versus the average investor.
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Controls */}
          <BlurFade delay={0.2} inView>
            <div className="space-y-6 rounded-3xl p-6 backdrop-blur-xl bg-gray-900/50 border border-gray-800">
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
                    className="w-36 text-sm rounded-xl bg-black border-gray-700 text-white"
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
                    className="w-32 text-sm rounded-xl bg-black border-gray-700 text-white"
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
                    className="w-20 text-sm rounded-xl bg-black border-gray-700 text-white"
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
                <Label className="text-sm font-medium mb-3 block text-gray-300">
                  Risk Profile
                </Label>
                <div className="flex gap-1 p-1 rounded-2xl bg-gray-800/50">
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

                {/* Allocation Donut Chart */}
                <div className="mt-4 flex justify-center">
                  <AllocationDonutChart
                    allocation={RISK_PROFILES[riskLevel].allocation}
                    summary={RISK_PROFILES[riskLevel].summary}
                  />
                </div>

                <p className="text-xs text-gray-500 mt-3 text-center">
                  {RISK_PROFILES[riskLevel].description}
                </p>
              </div>
            </div>
          </BlurFade>

          {/* Chart and Results */}
          <BlurFade delay={0.3} inView className="lg:col-span-2">
            <div className="rounded-3xl p-6 backdrop-blur-xl bg-gray-900/50 border border-gray-800">
              {/* Results Summary */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-2xl p-4">
                  <p className="text-sm mb-1 text-gray-400">With Clera</p>
                  <div className="text-2xl sm:text-3xl font-bold flex items-baseline text-white">
                    $<NumberTicker value={Math.round(finalCleraValue)} className="text-white" />
                  </div>
                </div>
                <div className="rounded-2xl p-4 bg-gray-800/50 border border-gray-700">
                  <p className="text-sm mb-1 text-gray-400">Average Investor</p>
                  <div className="text-2xl sm:text-3xl font-bold flex items-baseline text-gray-400">
                    $<NumberTicker value={Math.round(finalAverageValue)} className="text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Advantage Badge */}
              <div className="mb-6 text-center">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full">
                  <span className="text-blue-400 font-semibold">Clera advantage:</span>
                  <span className="font-bold text-white">+{formatCurrency(advantageAmount)}</span>
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
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                      vertical={false}
                    />
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
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                    />
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
