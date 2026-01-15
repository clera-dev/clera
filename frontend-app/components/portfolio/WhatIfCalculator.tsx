"use client";

import React, { useState, useMemo, useCallback } from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid
} from 'recharts';
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { format } from 'date-fns';

interface WhatIfCalculatorProps {
    currentPortfolioValue?: number | null;
}

// Define investment strategy return rates
const STRATEGY_RETURNS: Record<string, number> = {
    conservative: 0.04, // 4%
    moderate: 0.07,     // 7%
    aggressive: 0.10,    // 10%
};

// PRODUCTION-GRADE: Value limits for larger investors
const VALUE_LIMITS = {
    initialInvestment: {
        min: 0,
        max: 10_000_000,    // $10M max for high-net-worth investors
        step: 1000,
        sliderMax: 1_000_000, // Slider caps at $1M, input allows up to $10M
    },
    monthlyInvestment: {
        min: 0,
        max: 100_000,       // $100k max monthly contribution
        step: 100,
        sliderMax: 10_000,  // Slider caps at $10k, input allows up to $100k
    },
    timeHorizon: {
        min: 1,
        max: 50,            // Up to 50 years
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

// Helper to parse currency input (handles "$1,234" format)
const parseCurrencyInput = (value: string): number => {
    // Remove $ and commas, then parse
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-1 gap-1">
           <div className="flex flex-col">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                Year
              </span>
              <span className="font-bold">
                 {dataPoint.year}
              </span>
           </div>
           <div className="flex flex-col">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                Projected Value
              </span>
              <span className="font-bold text-primary">
                {formatCurrency(dataPoint.value)}
              </span>
            </div>
        </div>
      </div>
    );
  }
  return null;
};

const WhatIfCalculator: React.FC<WhatIfCalculatorProps> = ({ currentPortfolioValue = 0 }) => {
    // PRODUCTION-GRADE: Initialize from current portfolio value with proper defaults
    // Use $10,000 default when portfolio value is 0, null, or undefined
    const initialInvestmentValue = currentPortfolioValue && currentPortfolioValue > 0 
        ? Math.round(currentPortfolioValue) 
        : 10000; // Default to $10k for new users or empty portfolios
    const [initialInvestment, setInitialInvestment] = useState<number>(initialInvestmentValue);
    const [monthlyInvestment, setMonthlyInvestment] = useState<number>(500);
    const [timeHorizon, setTimeHorizon] = useState<number>(20); // years
    const [investmentStrategy, setInvestmentStrategy] = useState<string>('moderate');
    
    // Input field state for typing (allows formatted display while typing)
    const [initialInvestmentInput, setInitialInvestmentInput] = useState<string>(formatCurrency(initialInvestmentValue));
    const [monthlyInvestmentInput, setMonthlyInvestmentInput] = useState<string>(formatCurrency(500));
    const [timeHorizonInput, setTimeHorizonInput] = useState<string>('20');

    // CRITICAL: Update initial investment when portfolio value changes (auto-populate)
    React.useEffect(() => {
        if (currentPortfolioValue !== null && currentPortfolioValue !== undefined) {
            const nextValue = currentPortfolioValue > 0
                ? Math.round(currentPortfolioValue)
                : 10000; // reset to default when non-positive
            setInitialInvestment(nextValue);
            setInitialInvestmentInput(formatCurrency(nextValue));
        }
    }, [currentPortfolioValue]);

    // Handler for initial investment changes (both slider and input)
    const handleInitialInvestmentChange = useCallback((value: number) => {
        const clamped = Math.max(VALUE_LIMITS.initialInvestment.min, 
                                 Math.min(VALUE_LIMITS.initialInvestment.max, value));
        setInitialInvestment(clamped);
        setInitialInvestmentInput(formatCurrency(clamped));
    }, []);

    // Handler for monthly investment changes (both slider and input)
    const handleMonthlyInvestmentChange = useCallback((value: number) => {
        const clamped = Math.max(VALUE_LIMITS.monthlyInvestment.min, 
                                 Math.min(VALUE_LIMITS.monthlyInvestment.max, value));
        setMonthlyInvestment(clamped);
        setMonthlyInvestmentInput(formatCurrency(clamped));
    }, []);

    // Handler for time horizon changes
    const handleTimeHorizonChange = useCallback((value: number) => {
        const clamped = Math.max(VALUE_LIMITS.timeHorizon.min, 
                                 Math.min(VALUE_LIMITS.timeHorizon.max, value));
        setTimeHorizon(clamped);
        setTimeHorizonInput(clamped.toString());
    }, []);

    const expectedReturn = STRATEGY_RETURNS[investmentStrategy];

    const projectionData = useMemo(() => {
        const data = [];
        let currentValue = initialInvestment;
        const currentYear = new Date().getFullYear();
        const annualInvestment = monthlyInvestment * 12; // Convert monthly to annual

        if (initialInvestment < 0) return []; // Cannot project negative initial value

        data.push({ year: currentYear, value: currentValue });

        for (let i = 1; i <= timeHorizon; i++) {
            // Add annual investment at the *start* of the year, then calculate growth
            currentValue += annualInvestment;
            currentValue *= (1 + expectedReturn);
            data.push({ year: currentYear + i, value: currentValue });
        }
        return data;
    }, [initialInvestment, monthlyInvestment, timeHorizon, expectedReturn]);

    const finalProjectedValue = projectionData[projectionData.length - 1]?.value ?? initialInvestment;

    return (
        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4 items-start">
            {/* Inputs Column */}
            <div className="2xl:col-span-1 space-y-4">
                {/* Initial Investment - Typable + Slider */}
                <div>
                    <Label htmlFor="initialInvestment" className="text-sm font-medium">
                        Starting Portfolio Value
                    </Label>
                    <div className="flex gap-2 mt-1 items-center">
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
                            className="w-32 text-sm"
                            placeholder="$10,000"
                        />
                        <span className="text-xs text-muted-foreground">
                            (up to {formatCurrency(VALUE_LIMITS.initialInvestment.max)})
                        </span>
                    </div>
                    <Slider
                        id="initialInvestment"
                        min={VALUE_LIMITS.initialInvestment.min}
                        max={VALUE_LIMITS.initialInvestment.sliderMax}
                        step={VALUE_LIMITS.initialInvestment.step}
                        value={[Math.min(initialInvestment, VALUE_LIMITS.initialInvestment.sliderMax)]}
                        onValueChange={(value: number[]) => handleInitialInvestmentChange(value[0])}
                        className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Defaults to your current portfolio value. Type for larger amounts.
                    </p>
                </div>

                {/* Monthly Investment - Typable + Slider */}
                <div>
                    <Label htmlFor="monthlyInvestment" className="text-sm font-medium">
                        Additional Monthly Investment
                    </Label>
                    <div className="flex gap-2 mt-1 items-center">
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
                            className="w-32 text-sm"
                            placeholder="$500"
                        />
                        <span className="text-xs text-muted-foreground">
                            (up to {formatCurrency(VALUE_LIMITS.monthlyInvestment.max)}/mo)
                        </span>
                    </div>
                    <Slider
                        id="monthlyInvestment"
                        min={VALUE_LIMITS.monthlyInvestment.min}
                        max={VALUE_LIMITS.monthlyInvestment.sliderMax}
                        step={VALUE_LIMITS.monthlyInvestment.step}
                        value={[Math.min(monthlyInvestment, VALUE_LIMITS.monthlyInvestment.sliderMax)]}
                        onValueChange={(value: number[]) => handleMonthlyInvestmentChange(value[0])}
                        className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Annual: {formatCurrency(monthlyInvestment * 12)}
                    </p>
                </div>

                {/* Investment Strategy Buttons */}
                <div>
                    <Label className="text-sm font-medium">Investment Strategy (Expected Return)</Label>
                    <div className="flex gap-1 mt-1">
                        <button
                            onClick={() => setInvestmentStrategy('conservative')}
                            className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${
                                investmentStrategy === 'conservative'
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background hover:bg-accent border-border'
                            }`}
                        >
                            <div className="text-center">
                                <div className="font-medium">Conservative</div>
                                <div className="text-xs opacity-75">{(STRATEGY_RETURNS.conservative * 100).toFixed(0)}%</div>
                            </div>
                        </button>
                        <button
                            onClick={() => setInvestmentStrategy('moderate')}
                            className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${
                                investmentStrategy === 'moderate'
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background hover:bg-accent border-border'
                            }`}
                        >
                            <div className="text-center">
                                <div className="font-medium">Moderate</div>
                                <div className="text-xs opacity-75">{(STRATEGY_RETURNS.moderate * 100).toFixed(0)}%</div>
                            </div>
                        </button>
                        <button
                            onClick={() => setInvestmentStrategy('aggressive')}
                            className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${
                                investmentStrategy === 'aggressive'
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background hover:bg-accent border-border'
                            }`}
                        >
                            <div className="text-center">
                                <div className="font-medium">Aggressive</div>
                                <div className="text-xs opacity-75">{(STRATEGY_RETURNS.aggressive * 100).toFixed(0)}%</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Time Horizon - Typable + Slider */}
                <div>
                    <Label htmlFor="timeHorizon" className="text-sm font-medium">
                        Time Horizon
                    </Label>
                    <div className="flex gap-2 mt-1 items-center">
                        <Input
                            id="timeHorizonInput"
                            type="text"
                            value={timeHorizonInput}
                            onChange={(e) => setTimeHorizonInput(e.target.value)}
                            onBlur={(e) => {
                                const parsed = parseInt(e.target.value);
                                // If NaN (non-numeric input), default to 20. Otherwise clamp to valid range.
                                handleTimeHorizonChange(isNaN(parsed) ? 20 : parsed);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const parsed = parseInt(timeHorizonInput);
                                    handleTimeHorizonChange(isNaN(parsed) ? 20 : parsed);
                                }
                            }}
                            className="w-20 text-sm"
                            placeholder="20"
                        />
                        <span className="text-sm text-muted-foreground">years</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                            (1-{VALUE_LIMITS.timeHorizon.max} years)
                        </span>
                    </div>
                    <Slider
                        id="timeHorizon"
                        min={VALUE_LIMITS.timeHorizon.min}
                        max={VALUE_LIMITS.timeHorizon.max}
                        step={VALUE_LIMITS.timeHorizon.step}
                        value={[timeHorizon]}
                        onValueChange={(value: number[]) => handleTimeHorizonChange(value[0])}
                        className="mt-2"
                    />
                </div>
            </div>

            {/* Chart & Result Column */}
            <div className="2xl:col-span-2 space-y-4">
                 <Card className="bg-muted/50 border-dashed border-border">
                    <CardContent className="p-3 text-center">
                         <p className="text-xs text-muted-foreground mb-1">Projected Value in {timeHorizon} Years</p>
                         <p className="text-2xl font-bold text-primary">{formatCurrency(finalProjectedValue)}</p>
                    </CardContent>
                 </Card>

                 <div style={{ width: '100%', height: 200 }} className="">
                     <ResponsiveContainer>
                         <LineChart data={projectionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                             <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                             <XAxis
                                 dataKey="year"
                                 stroke="hsl(var(--muted-foreground))"
                                 tick={{ fontSize: 9 }}
                                 tickLine={false}
                                 axisLine={false}
                                 dy={5}
                             />
                             <YAxis
                                 orientation="right"
                                 stroke="hsl(var(--muted-foreground))"
                                 tick={{ fontSize: 9 }}
                                 tickLine={false}
                                 axisLine={false}
                                 tickFormatter={(value: number) => {
                                     // PRODUCTION-GRADE: Format large values appropriately
                                     if (value >= 1_000_000) {
                                         return `$${(value / 1_000_000).toFixed(1)}M`;
                                     } else if (value >= 1000) {
                                         return `$${(value / 1000).toFixed(0)}k`;
                                     }
                                     return `$${value.toFixed(0)}`;
                                 }}
                                 domain={['auto', 'auto']}
                                 width={45}
                             />
                             <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1, strokeDasharray: '3 3' }} />
                             <Line
                                 type="monotone"
                                 dataKey="value"
                                 stroke="hsl(var(--primary))"
                                 strokeWidth={2}
                                 dot={false}
                             />
                         </LineChart>
                     </ResponsiveContainer>
                 </div>
                 
                 <p className="text-xs text-muted-foreground">
                    Note: This is a hypothetical projection based on assumed returns and does not guarantee future results. Actual returns may vary.
                 </p>
            </div>
        </div>
    );
};

export default WhatIfCalculator; 