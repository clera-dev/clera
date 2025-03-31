"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, DollarSign, BarChart2, Percent, RefreshCw } from "lucide-react";

export default function PortfolioPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [portfolioData, setPortfolioData] = useState({
    totalValue: 68395.63,
    returns: {
      amount: 2578.98,
      percentage: 3.82,
      isPositive: true
    },
    performance: {
      daily: 0.25,
      weekly: 1.32,
      monthly: 2.78,
      yearly: 3.82
    },
    allocation: {
      stocks: 62,
      bonds: 28,
      cash: 6,
      other: 4
    }
  });

  useEffect(() => {
    // Simulate loading portfolio data
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // Format currency with commas
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Portfolio Dashboard</h1>
        <span className="text-sm text-muted-foreground">Last updated: Today, 10:43 AM</span>
      </div>
      
      {/* Portfolio Summary */}
      <div className="mb-8">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Portfolio Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
                <h2 className="text-3xl font-bold">{formatCurrency(portfolioData.totalValue)}</h2>
              </div>
              <div className="flex items-center mt-2 md:mt-0">
                {portfolioData.returns.isPositive ? (
                  <ArrowUpRight className="h-5 w-5 text-green-500 mr-1" />
                ) : (
                  <ArrowDownRight className="h-5 w-5 text-red-500 mr-1" />
                )}
                <span className={`text-lg font-medium ${portfolioData.returns.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(portfolioData.returns.amount)} ({formatPercentage(portfolioData.returns.percentage)})
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Your portfolio has grown by {formatPercentage(portfolioData.returns.percentage)} in the last 12 months.
              This is {portfolioData.returns.percentage > 3 ? 'above' : 'below'} the market average.
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Daily</p>
                <p className={`text-2xl font-semibold ${portfolioData.performance.daily >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {portfolioData.performance.daily > 0 ? '+' : ''}{formatPercentage(portfolioData.performance.daily)}
                </p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Weekly</p>
                <p className={`text-2xl font-semibold ${portfolioData.performance.weekly >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {portfolioData.performance.weekly > 0 ? '+' : ''}{formatPercentage(portfolioData.performance.weekly)}
                </p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full">
                <BarChart2 className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Monthly</p>
                <p className={`text-2xl font-semibold ${portfolioData.performance.monthly >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {portfolioData.performance.monthly > 0 ? '+' : ''}{formatPercentage(portfolioData.performance.monthly)}
                </p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full">
                <Percent className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Yearly</p>
                <p className={`text-2xl font-semibold ${portfolioData.performance.yearly >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {portfolioData.performance.yearly > 0 ? '+' : ''}{formatPercentage(portfolioData.performance.yearly)}
                </p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full">
                <RefreshCw className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Asset Allocation */}
      <div className="mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Stocks</span>
                  <span className="text-sm text-muted-foreground">{portfolioData.allocation.stocks}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${portfolioData.allocation.stocks}%` }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Bonds</span>
                  <span className="text-sm text-muted-foreground">{portfolioData.allocation.bonds}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div 
                    className="bg-green-500 h-2.5 rounded-full" 
                    style={{ width: `${portfolioData.allocation.bonds}%` }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Cash</span>
                  <span className="text-sm text-muted-foreground">{portfolioData.allocation.cash}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div 
                    className="bg-yellow-500 h-2.5 rounded-full" 
                    style={{ width: `${portfolioData.allocation.cash}%` }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Other</span>
                  <span className="text-sm text-muted-foreground">{portfolioData.allocation.other}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div 
                    className="bg-purple-500 h-2.5 rounded-full" 
                    style={{ width: `${portfolioData.allocation.other}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Advisor Insights */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Clera's Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            Based on your current portfolio allocation and market conditions, here are some insights:
          </p>
          <ul className="space-y-2 list-disc pl-5">
            <li>Your portfolio is well-diversified with a good balance between stocks and bonds.</li>
            <li>Consider increasing your cash reserve slightly to prepare for potential market volatility.</li>
            <li>Your yearly performance is outpacing inflation, which is a positive sign for long-term growth.</li>
            <li>The tech sector in your portfolio is performing exceptionally well, contributing to your overall positive returns.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
} 