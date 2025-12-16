'use client';

import React, { useState, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  PieChart,
  BarChart3
} from 'lucide-react';

interface Account {
  id: string;
  provider: string;
  account_type: string;
  institution_name: string;
  account_name: string;
  balance: number;
  is_active: boolean;
}

interface Position {
  symbol: string;
  security_name?: string;
  security_type: string;
  total_quantity: number;
  total_market_value: number;
  total_cost_basis: number;
  average_cost_basis: number;
  unrealized_gain_loss: number;
  unrealized_gain_loss_percent: number;
  accounts: Array<{
    account_id: string;
    quantity: number;
    market_value: number;
    cost_basis: number;
    institution: string;
  }>;
  institutions: string[];
}

interface PortfolioData {
  accounts: Account[];
  positions: Position[];
  summary: {
    total_value: number;
    total_cost_basis: number;
    total_gain_loss: number;
    total_gain_loss_percent: number;
    account_count: number;
    position_count: number;
  };
  metadata: {
    last_updated: string;
    providers: string[];
    data_freshness: string;
  };
}

export default function TestPortfolioAggregationPage() {
  // State management
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<any>(null);

  // Create Plaid Link token
  const createLinkToken = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/test/plaid/create-link-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: 'test@clera.ai'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create link token');
      }

      const data = await response.json();
      setLinkToken(data.link_token);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create link token';
      setError(message);
      console.error('Error creating link token:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle successful Plaid Link
  const onSuccessCallback = async (public_token: string, metadata: any) => {
    try {
      setLoading(true);
      setError(null);

      console.log('Plaid Link success:', { public_token, metadata });
      console.log('🔍 Institution connected:', metadata.institution?.name);
      console.log('🔍 Accounts connected:', metadata.accounts?.length || 0);

      const response = await fetch('/api/test/plaid/exchange-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          public_token,
          institution_name: metadata.institution?.name || 'Test Institution'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to exchange token');
      }

      const data = await response.json();
      console.log('🔍 Token exchange result:', data);
      
      setConnectedAccounts(data.accounts || []);
      
      // Show user-friendly message about what was connected
      if (data.accounts && data.accounts.length === 0) {
        console.warn('⚠️ No investment accounts found. The connected institution may only have bank accounts (checking/savings), not investment accounts.');
        setError('No investment accounts found. Please try connecting to an investment institution like Fidelity, Schwab, or Vanguard rather than a bank.');
      }
      
      // Refresh portfolio data after connection
      await fetchPortfolioData();

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect account';
      setError(message);
      console.error('Error exchanging token:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Plaid Link exit (includes errors and user exit)
  const onExitCallback = (err: any, metadata: any) => {
    console.log('Plaid Link exit:', { err, metadata });
    setLoading(false);
    
    if (err) {
      console.error('Plaid Link error:', err);
      setError(err.error_message || err.message || 'Connection failed');
    }
  };

  // Configure Plaid Link (react-plaid-link v4.1.1 format)
  const config = {
    token: linkToken,
    onSuccess: onSuccessCallback,
    onExit: onExitCallback,  // Handles both errors and user exit
  };

  const { open, ready } = usePlaidLink(config);

  // Fetch aggregated portfolio data
  const fetchPortfolioData = async (forceRefresh = false, maxAgeMinutes = 30) => {
    try {
      setLoading(true);
      setError(null);

      console.log(`📊 Fetching portfolio data: force_refresh=${forceRefresh}, max_age=${maxAgeMinutes}min`);

      const queryParams = new URLSearchParams({
        force_refresh: forceRefresh.toString(),
        max_age_minutes: maxAgeMinutes.toString()
      });

      const response = await fetch(`/api/test/portfolio/aggregated?${queryParams}`, {
        method: 'GET',  // Keep as GET for frontend, Next.js route will convert to POST
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch portfolio data');
      }

      const result = await response.json();
      setPortfolioData(result.data);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load portfolio';
      setError(message);
      console.error('Error fetching portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch health status
  const fetchHealthStatus = async () => {
    try {
      const response = await fetch('/api/test/portfolio/health');
      const data = await response.json();
      setHealthStatus(data);
    } catch (err) {
      console.error('Error fetching health status:', err);
    }
  };

  // Initialize link token and load existing portfolio data on component mount
  useEffect(() => {
    createLinkToken();
    fetchHealthStatus();
    fetchPortfolioData(); // Auto-load existing portfolio data
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Portfolio Aggregation Test</h1>
        <p className="text-gray-600 mt-2">
          Test the new Plaid Investment API integration for multi-account portfolio aggregation
        </p>
      </div>

      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="connect" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="connect">Connect Accounts</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio View</TabsTrigger>
          <TabsTrigger value="accounts">Connected Accounts</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
        </TabsList>

        {/* Connect Accounts Tab */}
        <TabsContent value="connect">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <PieChart className="h-5 w-5" />
                <span>Connect Investment Accounts</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Plaid Investment API Test</h3>
                <p className="text-blue-700 text-sm mb-4">
                  Connect your investment accounts to test portfolio aggregation across multiple institutions.
                  This will access brokerage, 401k, IRA, and other investment account types.
                </p>
                <div className="space-y-2">
                  <p className="text-xs text-blue-600">
                    • <strong>Investment Institutions:</strong> Fidelity, Schwab, Vanguard, E*TRADE, TD Ameritrade
                  </p>
                  <p className="text-xs text-blue-600">
                    • <strong>Account Types:</strong> Brokerage, 401k, IRA, Roth IRA, 529, HSA
                  </p>
                  <p className="text-xs text-blue-600">
                    • <strong>⚠️ Important:</strong> Connect to an investment institution, not just a bank
                  </p>
                  <p className="text-xs text-blue-600">
                    • <strong>Data:</strong> Holdings, transactions, performance across all accounts
                  </p>
                </div>
              </div>

              <Button
                onClick={() => ready && open()}
                disabled={!ready || loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="animate-spin h-4 w-4" />
                    <span>Connecting...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Connect Investment Account</span>
                  </div>
                )}
              </Button>

              {connectedAccounts.length > 0 && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">
                    ✅ Successfully Connected {connectedAccounts.length} Account(s)
                  </h4>
                  <div className="space-y-2">
                    {connectedAccounts.map((account, index) => (
                      <div key={index} className="text-sm text-green-700">
                        {account.account_name} - {account.institution_name} ({account.account_type})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Portfolio View Tab */}
        <TabsContent value="portfolio">
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>Aggregated Portfolio</span>
                </CardTitle>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchPortfolioData(false, 30)}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => fetchPortfolioData(true, 0)}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Force Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
              {!portfolioData ? (
                <div className="text-center py-8">
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse bg-gray-200 h-32 rounded-lg"></div>
                    ))}
                  </div>
                  <p className="text-gray-500 mt-4">Loading portfolio data...</p>
                </div>
              ) : (
                  <div className="space-y-6">
                    {/* Portfolio Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <DollarSign className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-800">Total Value</span>
                        </div>
                        <div className="text-2xl font-bold text-green-900 mt-1">
                          ${portfolioData.summary.total_value.toLocaleString()}
                        </div>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-sm font-medium text-gray-600">Cost Basis</div>
                        <div className="text-xl font-semibold text-gray-900 mt-1">
                          ${portfolioData.summary.total_cost_basis.toLocaleString()}
                        </div>
                      </div>

                      <div className={`p-4 rounded-lg ${
                        portfolioData.summary.total_gain_loss >= 0 
                          ? 'bg-green-50' 
                          : 'bg-red-50'
                      }`}>
                        <div className="flex items-center space-x-2">
                          {portfolioData.summary.total_gain_loss >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span className={`text-sm font-medium ${
                            portfolioData.summary.total_gain_loss >= 0 
                              ? 'text-green-800' 
                              : 'text-red-800'
                          }`}>
                            Gain/Loss
                          </span>
                        </div>
                        <div className={`text-xl font-semibold mt-1 ${
                          portfolioData.summary.total_gain_loss >= 0 
                            ? 'text-green-900' 
                            : 'text-red-900'
                        }`}>
                          {portfolioData.summary.total_gain_loss >= 0 ? '+' : ''}
                          ${portfolioData.summary.total_gain_loss.toLocaleString()}
                        </div>
                        <div className={`text-sm ${
                          portfolioData.summary.total_gain_loss >= 0 
                            ? 'text-green-700' 
                            : 'text-red-700'
                        }`}>
                          ({portfolioData.summary.total_gain_loss_percent.toFixed(2)}%)
                        </div>
                      </div>

                      <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-sm font-medium text-blue-600">Accounts</div>
                        <div className="text-xl font-semibold text-blue-900 mt-1">
                          {portfolioData.summary.account_count}
                        </div>
                        <div className="text-sm text-blue-700">
                          {portfolioData.summary.position_count} holdings
                        </div>
                      </div>
                    </div>

                    {/* Holdings */}
                    {portfolioData.positions.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Holdings ({portfolioData.positions.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {portfolioData.positions.map((position, index) => (
                              <div key={index} className="p-4 border rounded-lg hover:bg-gray-50/50 hover:border-gray-300 transition-all duration-200 cursor-pointer">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-semibold text-lg">{position.symbol}</span>
                                    {position.security_name && (
                                      <span className="text-sm text-gray-600">
                                        {position.security_name}
                                      </span>
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      {position.security_type}
                                    </Badge>
                                    <div className="flex space-x-1">
                                      {position.institutions.map((institution, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">
                                          {institution}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                  
                                <div className="text-right">
                                  <div className="font-semibold text-lg text-gray-900">
                                    ${position.total_market_value.toLocaleString()}
                                  </div>
                                  <div className={`text-sm flex items-center justify-end font-medium ${
                                    position.unrealized_gain_loss >= 0 ? 'text-green-700' : 'text-red-700'
                                  }`}>
                                    {position.unrealized_gain_loss >= 0 ? (
                                      <TrendingUp className="h-3 w-3 mr-1" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3 mr-1" />
                                    )}
                                    {position.unrealized_gain_loss >= 0 ? '+' : ''}
                                    ${position.unrealized_gain_loss.toLocaleString()} 
                                    ({position.unrealized_gain_loss_percent.toFixed(2)}%)
                                  </div>
                                </div>
                                </div>
                                
                                <div className="text-sm text-gray-600 mb-2">
                                  {position.total_quantity.toLocaleString()} shares @ avg cost ${position.average_cost_basis.toFixed(2)}
                                </div>
                                
                                {/* Account breakdown */}
                                <div className="text-xs text-gray-600 space-y-1 bg-gray-50/80 p-2 rounded">
                                  <div className="font-medium text-gray-700">Account Breakdown:</div>
                                  {position.accounts.map((account, idx) => (
                                    <div key={idx} className="flex justify-between pl-2">
                                      <span className="text-gray-600">{account.institution}</span>
                                      <span className="text-gray-700 font-medium">{account.quantity} shares • ${account.market_value.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Connected Accounts Tab */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Connected Investment Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {portfolioData?.accounts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No investment accounts connected yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {portfolioData?.accounts.map((account, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium">{account.account_name}</div>
                          <div className="text-sm text-gray-600">{account.institution_name}</div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {account.account_type}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">
                            ${account.balance.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">Cash Balance</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Status Tab */}
        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle>System Health Status</CardTitle>
            </CardHeader>
            <CardContent>
              {healthStatus ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${
                    healthStatus.overall_status === 'healthy' 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className={`h-5 w-5 ${
                        healthStatus.overall_status === 'healthy' 
                          ? 'text-green-600' 
                          : 'text-yellow-600'
                      }`} />
                      <span className="font-medium">
                        Overall Status: {healthStatus.overall_status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(healthStatus.providers || {}).map(([provider, status]: [string, any]) => (
                      <div key={provider} className="p-3 border rounded">
                        <div className="flex justify-between items-center">
                          <div className="font-medium">{provider.toUpperCase()} Provider</div>
                          <Badge 
                            variant={status.status === 'healthy' ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {status.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Environment: {status.environment || 'unknown'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Version: {status.version || 'unknown'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Button onClick={fetchHealthStatus} variant="outline">
                    Check Health Status
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-gray-500">
        <p>Portfolio Aggregation Test Environment - Plaid Sandbox Mode</p>
        <p>Last Updated: {portfolioData?.metadata.last_updated ? 
          new Date(portfolioData.metadata.last_updated).toLocaleString() : 'Never'}</p>
      </div>
    </div>
  );
}
