"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, DollarSign, AlertTriangle, TrendingUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import toast from 'react-hot-toast';
import { createClient } from "@/utils/supabase/client";

export default function TradingPreferences() {
  const [buyingPowerDisplay, setBuyingPowerDisplay] = useState<'cash_only' | 'cash_and_margin'>('cash_only');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current preference
  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.error('No session found');
          setIsLoading(false);
          return;
        }

        // Use backend URL from environment variable
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const apiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'clera-is-the-goat-tok8s825nvjdk0482mc6';
        
        const response = await fetch(`${backendUrl}/api/user/preferences`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'X-API-Key': apiKey,
          },
        });
        const data = await response.json();
        
        if (data.success) {
          setBuyingPowerDisplay(data.preferences.buying_power_display);
        }
      } catch (error) {
        console.error('Error fetching preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreference();
  }, []);

  // Update preference
  const handlePreferenceChange = async (value: 'cash_only' | 'cash_and_margin') => {
    setIsSaving(true);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Please sign in to update preferences');
        setIsSaving(false);
        return;
      }

      // Use backend URL from environment variable
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const apiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'clera-is-the-goat-tok8s825nvjdk0482mc6';
      
      const response = await fetch(`${backendUrl}/api/user/preferences/buying-power`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          buying_power_display: value
        })
      });

      const data = await response.json();

      if (data.success) {
        setBuyingPowerDisplay(value);
        toast.success(value === 'cash_only' 
          ? '✅ Set to Cash Only (safer)' 
          : '✅ Set to Cash + Margin'
        );
      } else {
        toast.error('Failed to update preference');
      }
    } catch (error) {
      console.error('Error updating preference:', error);
      toast.error('Failed to update preference');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Trading Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preferences...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Trading Preferences
        </CardTitle>
        <CardDescription>
          Customize how buying power is displayed in the order modal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-base font-semibold mb-3 block">
            Buying Power Display
          </Label>
          
          <RadioGroup
            value={buyingPowerDisplay}
            onValueChange={(value) => handlePreferenceChange(value as 'cash_only' | 'cash_and_margin')}
            disabled={isSaving}
            className="space-y-3"
          >
            {/* Cash Only Option (Default - Safer) */}
            <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-accent transition-colors">
              <RadioGroupItem value="cash_only" id="cash_only" />
              <Label
                htmlFor="cash_only"
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Cash Only</span>
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Shows only your actual cash balance. Safer for most traders.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Example: If you have $342 cash → shows <span className="font-mono">$342.00</span>
                    </p>
                  </div>
                </div>
              </Label>
            </div>

            {/* Cash + Margin Option (Advanced) */}
            <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-accent transition-colors">
              <RadioGroupItem value="cash_and_margin" id="cash_and_margin" />
              <Label
                htmlFor="cash_and_margin"
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Cash + Margin</span>
                      <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-full">
                        Advanced
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Shows total buying power including available margin.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Example: If you have $342 cash + margin → shows <span className="font-mono">$25,865.06</span>
                    </p>
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Info Alert */}
        {buyingPowerDisplay === 'cash_and_margin' && (
          <Alert variant="default" className="bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/20">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-sm text-orange-800 dark:text-orange-300">
              <strong>Margin Trading Risks:</strong> Using margin can amplify both gains and losses. 
              Only use margin if you understand the risks involved.
            </AlertDescription>
          </Alert>
        )}

        {isSaving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving preference...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

