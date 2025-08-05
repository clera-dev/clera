"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CleraAssist from '@/components/ui/clera-assist';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';

const CleraAssistDemo: React.FC = () => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold">Clera Assist Demo</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Card with Corner Assist */}
        <CleraAssist
          content="Sample financial data"
          context="demo_page"
          prompt="I'm looking at this sample financial data card. Can you explain what this type of information is used for in investment analysis?"
          triggerText="Ask Clera"
          description="Get help understanding this financial concept"
          trigger="hover"
          placement="corner"
          priority="medium"
          onAssistClick={(prompt) => openChatWithPrompt(prompt, "demo")}
        >
          <Card className="bg-card shadow-lg">
            <CardHeader>
              <CardTitle>Sample Financial Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span>Risk Score:</span>
                  <span className="font-semibold">7.2/10</span>
                </div>
                <div className="flex justify-between">
                  <span>Diversification Score:</span>
                  <span className="font-semibold">6.8/10</span>
                </div>
                <div className="flex justify-between">
                  <span>Portfolio Value:</span>
                  <span className="font-semibold">$68,395.63</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </CleraAssist>

        {/* Auto-trigger Card */}
        <CleraAssist
          content="Investment recommendation"
          context="demo_recommendations"
          prompt="I'm looking at this investment recommendation. Can you explain why this might be a good investment and what factors I should consider?"
          triggerText="Why this pick?"
          description="Understand the reasoning behind this recommendation"
          trigger="auto"
          placement="inline"
          priority="high"
          onAssistClick={(prompt) => openChatWithPrompt(prompt, "recommendations")}
        >
          <Card className="bg-card shadow-lg">
            <CardHeader>
              <CardTitle>Investment Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">AAPL</span>
                  <span className="text-green-600">+2.3%</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Apple Inc. - Strong fundamentals with consistent growth in services revenue.
                </p>
                <div className="text-sm">
                  <span>Recommended allocation: </span>
                  <span className="font-semibold">5-8%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </CleraAssist>

        {/* Overlay Assist */}
        <CleraAssist
          content="Complex financial chart"
          context="demo_chart"
          prompt="I'm looking at this complex financial chart. Can you help me understand how to read and interpret this type of data visualization?"
          triggerText="Explain this chart"
          description="Learn how to read complex financial charts"
          trigger="hover"
          placement="overlay"
          priority="low"
          onAssistClick={(prompt) => openChatWithPrompt(prompt, "charts")}
        >
          <Card className="bg-card shadow-lg">
            <CardHeader>
              <CardTitle>Portfolio Performance Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 bg-gradient-to-r from-blue-100 to-green-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">📈</div>
                  <p className="text-sm text-muted-foreground mt-2">Sample Chart Area</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CleraAssist>

        {/* Status Card */}
        <Card className="bg-card shadow-lg">
          <CardHeader>
            <CardTitle>Clera Assist Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>System Status:</span>
                <span className={`font-semibold ${isEnabled ? 'text-green-600' : 'text-red-600'}`}>
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {isEnabled 
                  ? 'Hover over cards above to see Clera Assist in action!'
                  : 'Clera Assist is currently disabled.'
                }
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CleraAssistDemo; 