"use client";

import React, { useState, useMemo } from 'react';
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
    const initialInvestmentValue = Math.round(currentPortfolioValue ?? 1000); // Round to nearest dollar and default to 1000
    const [initialInvestment, setInitialInvestment] = useState<number>(initialInvestmentValue);
    const [monthlyInvestment, setMonthlyInvestment] = useState<number>(500);
    const [timeHorizon, setTimeHorizon] = useState<number>(20); // years
    const [investmentStrategy, setInvestmentStrategy] = useState<string>('moderate');

    // Update initial investment if prop changes after initial render
    React.useEffect(() => {
        if (currentPortfolioValue !== null && currentPortfolioValue !== undefined) {
            setInitialInvestment(Math.round(currentPortfolioValue));
        }
    }, [currentPortfolioValue]);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Inputs Column */}
            <div className="md:col-span-1 space-y-6">
                <div>
                    <Label htmlFor="initialInvestment" className="text-sm font-medium">
                        Initial Investment ({formatCurrency(initialInvestment)})
                    </Label>
                    <Slider
                        id="initialInvestment"
                        min={0}
                        max={50000}
                        step={100}
                        value={[initialInvestment]}
                        onValueChange={(value: number[]) => setInitialInvestment(value[0])}
                        className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Defaults to current portfolio value.</p>
                </div>

                <div>
                    <Label htmlFor="monthlyInvestment" className="text-sm font-medium">
                        Additional Monthly Investment ({formatCurrency(monthlyInvestment)})
                    </Label>
                    <Slider
                        id="monthlyInvestment"
                        min={0}
                        max={5000}
                        step={25}
                        value={[monthlyInvestment]}
                        onValueChange={(value: number[]) => setMonthlyInvestment(value[0])}
                        className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Annual: {formatCurrency(monthlyInvestment * 12)}
                    </p>
                </div>

                <div>
                    <Label className="text-sm font-medium">Investment Strategy (Expected Return)</Label>
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={() => setInvestmentStrategy('conservative')}
                            className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
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
                            className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
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
                            className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
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

                <div>
                    <Label htmlFor="timeHorizon" className="text-sm font-medium">Time Horizon ({timeHorizon} years)</Label>
                    <Slider
                        id="timeHorizon"
                        min={1}
                        max={40}
                        step={1}
                        value={[timeHorizon]}
                        onValueChange={(value: number[]) => setTimeHorizon(value[0])}
                        className="mt-2"
                    />
                </div>

                <p className="text-xs text-muted-foreground pt-4 border-t border-border">
                    Note: This is a hypothetical projection based on assumed returns and does not guarantee future results. Actual returns may vary.
                </p>
            </div>

            {/* Chart & Result Column */}
            <div className="md:col-span-2">
                 <Card className="bg-muted/50 border-dashed border-border">
                    <CardContent className="p-4 text-center">
                         <p className="text-sm text-muted-foreground mb-1">Projected Value in {timeHorizon} Years</p>
                         <p className="text-3xl font-bold text-primary">{formatCurrency(finalProjectedValue)}</p>
                    </CardContent>
                 </Card>

                 <div style={{ width: '100%', height: 250 }} className="mt-6">
                     <ResponsiveContainer>
                         <LineChart data={projectionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                             <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                             <XAxis
                                 dataKey="year"
                                 stroke="hsl(var(--muted-foreground))"
                                 tick={{ fontSize: 10 }}
                                 tickLine={false}
                                 axisLine={false}
                                 dy={5}
                             />
                             <YAxis
                                 orientation="right"
                                 stroke="hsl(var(--muted-foreground))"
                                 tick={{ fontSize: 10 }}
                                 tickLine={false}
                                 axisLine={false}
                                 tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
                                 domain={['auto', 'auto']}
                                 width={40}
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
            </div>
        </div>
    );
};

export default WhatIfCalculator; 