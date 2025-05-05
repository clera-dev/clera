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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    const initialInvestmentValue = currentPortfolioValue ?? 10000; // Default if prop is null/undefined
    const [initialInvestment, setInitialInvestment] = useState<number>(initialInvestmentValue);
    const [annualInvestment, setAnnualInvestment] = useState<number>(5000);
    const [timeHorizon, setTimeHorizon] = useState<number>(20); // years
    const [investmentStrategy, setInvestmentStrategy] = useState<string>('moderate');

    // Update initial investment if prop changes after initial render
    React.useEffect(() => {
        if (currentPortfolioValue !== null && currentPortfolioValue !== undefined) {
            setInitialInvestment(currentPortfolioValue);
        }
    }, [currentPortfolioValue]);

    const expectedReturn = STRATEGY_RETURNS[investmentStrategy];

    const projectionData = useMemo(() => {
        const data = [];
        let currentValue = initialInvestment;
        const currentYear = new Date().getFullYear();

        if (initialInvestment < 0) return []; // Cannot project negative initial value

        data.push({ year: currentYear, value: currentValue });

        for (let i = 1; i <= timeHorizon; i++) {
            // Add annual investment at the *start* of the year, then calculate growth
            currentValue += annualInvestment;
            currentValue *= (1 + expectedReturn);
            data.push({ year: currentYear + i, value: currentValue });
        }
        return data;
    }, [initialInvestment, annualInvestment, timeHorizon, expectedReturn]);

    const finalProjectedValue = projectionData[projectionData.length - 1]?.value ?? initialInvestment;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Inputs Column */}
            <div className="md:col-span-1 space-y-6">
                <div>
                    <Label htmlFor="initialInvestment" className="text-sm font-medium">Initial Investment</Label>
                    <Input
                        id="initialInvestment"
                        type="number"
                        value={initialInvestment}
                        onChange={(e) => setInitialInvestment(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="mt-1"
                        min="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Defaults to current portfolio value.</p>
                </div>

                <div>
                    <Label htmlFor="annualInvestment" className="text-sm font-medium">Annual Investment</Label>
                    <Input
                        id="annualInvestment"
                        type="number"
                        value={annualInvestment}
                        onChange={(e) => setAnnualInvestment(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="mt-1"
                        min="0"
                        step="100"
                    />
                </div>

                 <div>
                    <Label className="text-sm font-medium">Investment Strategy (Expected Return)</Label>
                    <Select value={investmentStrategy} onValueChange={setInvestmentStrategy}>
                        <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="conservative">Conservative ({(STRATEGY_RETURNS.conservative * 100).toFixed(0)}%)</SelectItem>
                            <SelectItem value="moderate">Moderate ({(STRATEGY_RETURNS.moderate * 100).toFixed(0)}%)</SelectItem>
                            <SelectItem value="aggressive">Aggressive ({(STRATEGY_RETURNS.aggressive * 100).toFixed(0)}%)</SelectItem>
                        </SelectContent>
                    </Select>
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