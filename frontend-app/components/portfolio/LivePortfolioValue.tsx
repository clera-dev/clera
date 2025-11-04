"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Removed direct import of useWebSocket as we are using native WebSocket now
// import useWebSocket, { ReadyState } from 'react-use-websocket';
import { createClient } from '@/utils/supabase/client'; // Import Supabase client

interface LivePortfolioValueProps {
    accountId: string;
    portfolioMode?: string; // Add portfolio mode to determine connection type
}

interface TimerRefs {
    [key: string]: number | NodeJS.Timeout;
}

// Define the WebSocket URL based on environment
// Using environment variables with fallbacks for flexibility
const WEBSOCKET_URL_TEMPLATE = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_WEBSOCKET_URL_DEV || 'ws://localhost:8001/ws/portfolio/{accountId}') // Template includes placeholder
  : (process.env.NEXT_PUBLIC_WEBSOCKET_URL_PROD || 'wss://ws.askclera.com/ws/portfolio/{accountId}'); // Template includes placeholder

const LivePortfolioValue: React.FC<LivePortfolioValueProps> = ({ accountId, portfolioMode = 'brokerage' }) => {
    const [totalValue, setTotalValue] = useState<string>("$0.00");
    const [todayReturn, setTodayReturn] = useState<string>("+$0.00 (0.00%)");
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
    const [useFallback, setUseFallback] = useState<boolean>(portfolioMode === 'aggregation');
    
    const timeoutRef = useRef<TimerRefs>({});
    const intervalRef = useRef<TimerRefs>({});
    const supabase = useMemo(() => createClient(), []); // Create supabase client instance once
    
    // For aggregation mode, always use fallback API (no real-time websockets)
    const shouldUseWebSocket = useMemo(() => {
        return portfolioMode === 'brokerage' || portfolioMode === 'hybrid';
    }, [portfolioMode]);

    // Refs to hold the latest values of state for intervals/timeouts
    const socketRef = useRef<WebSocket | null>(socket);
    const isConnectedRef = useRef<boolean>(isConnected);
    const useFallbackRef = useRef<boolean>(useFallback);
    const connectionAttemptsRef = useRef<number>(connectionAttempts);
    const isLoadingRef = useRef<boolean>(isLoading);

    // Keep refs synchronized with state
    useEffect(() => { socketRef.current = socket; }, [socket]);
    useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
    useEffect(() => { useFallbackRef.current = useFallback; }, [useFallback]);
    useEffect(() => { connectionAttemptsRef.current = connectionAttempts; }, [connectionAttempts]);
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

    // Calculate the actual WebSocket URL with the account ID
    const websocketUrl = useMemo(() => {
        if (!accountId || accountId === 'undefined') {
            console.warn('Attempted to create WebSocket URL with invalid accountId:', accountId);
            return null; // Return null for invalid accountId
        }
        return WEBSOCKET_URL_TEMPLATE.replace('{accountId}', accountId);
    }, [accountId]);
    
    const clearAllTimers = () => {
        Object.values(timeoutRef.current).forEach(timeout => 
            clearTimeout(timeout as NodeJS.Timeout));
        Object.values(intervalRef.current).forEach(interval => 
            clearInterval(interval as NodeJS.Timeout));
        timeoutRef.current = {};
        intervalRef.current = {};
    };

    const fetchPortfolioData = async () => {
        // For aggregation mode, use aggregated endpoint + calculate today's return from history
        if (portfolioMode === 'aggregation') {
            try {
                // Fetch both current value and 1W history in parallel to calculate today's return
                const [positionsRes, historyRes] = await Promise.all([
                    fetch(`/api/portfolio/aggregated`),
                    fetch(`/api/portfolio/history?accountId=null&period=1W`)
                ]);
                
                if (positionsRes.ok && historyRes.ok) {
                    const positionsData = await positionsRes.json();
                    const historyData = await historyRes.json();
                    
                    // CRITICAL: Use summary.total_value which includes cash
                    // The positions array excludes cash (for holdings table display)
                    // but the summary includes cash for accurate total portfolio value
                    const totalValue = positionsData.summary?.total_value || 0;
                    
                    setTotalValue(`$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                    
                    // Calculate today's return from history data
                    // Backend returns { timestamp: [], equity: [], profit_loss: [], profit_loss_pct: [] } format
                    const equityValues = historyData?.equity || [];
                    const profitLoss = historyData?.profit_loss || [];
                    const profitLossPct = historyData?.profit_loss_pct || [];
                    
                    // PRODUCTION-GRADE: Use backend's calculated P/L (handles weekends/holidays correctly)
                    // Backend sets profit_loss[last] = 0.0 on weekends/holidays
                    if (equityValues.length >= 2 && profitLoss.length > 0) {
                        // Get today's P/L from backend (last element in profit_loss array)
                        const todayReturn = parseFloat(profitLoss[profitLoss.length - 1]) || 0;
                        const returnPercent = parseFloat(profitLossPct[profitLossPct.length - 1]) || 0;
                        
                        // Check if market is closed (weekend/holiday) - backend returns 0.0
                        const isMarketClosed = todayReturn === 0 && returnPercent === 0;
                        
                        // Format with correct signs (both dollar and percent must match)
                        const sign = todayReturn >= 0 ? '+' : '-';
                        const absReturn = Math.abs(todayReturn);
                        const absPercent = Math.abs(returnPercent);
                        
                        if (isMarketClosed) {
                            // Market closed (weekend/holiday) - show $0.00 explicitly
                            setTodayReturn("$0.00 (0.00%)");
                        } else {
                            // Market open - show actual return
                            setTodayReturn(`${sign}$${absReturn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sign}${absPercent.toFixed(2)}%)`);
                        }
                    } else {
                        // Fallback if not enough history
                        setTodayReturn("$0.00 (0.00%)");
                    }
                    
                    setIsLoading(false);
                    return true;
                } else {
                    console.error(`Failed to fetch aggregation data: positions=${positionsRes.status}, history=${historyRes.status}`);
                }
            } catch (error) {
                console.error('Error fetching aggregated portfolio data:', error);
            }
            setIsLoading(false);
            return false;
        }
        
        // For brokerage/hybrid mode, use the existing endpoint
        if (!accountId || accountId === 'undefined' || accountId === 'null') {
            console.error('No valid account ID provided for fetching brokerage portfolio data');
            setIsLoading(false);
            return false;
        }

        try {
            const response = await fetch(`/api/portfolio/value?accountId=${accountId}`);
            if (response.ok) {
                const data = await response.json();
                setTotalValue(data.total_value);
                setTodayReturn(data.today_return);
                setIsLoading(false);
                return true;
            } else {
                console.error(`Failed to fetch brokerage portfolio data: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error fetching brokerage portfolio data:', error);
        }
        
        setIsLoading(false); // Ensure loading is set to false even on error
        return false;
    };

    const connectWebSocket = async (urlToConnect: string) => {
        if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
            console.log('WebSocket already connecting or connected, skipping new connection attempt');
            return;
        }
        
        if (isConnectedRef.current && socketRef.current) {
            console.log('WebSocket already marked as connected, skipping new connection attempt');
            return;
        }
        
        try {
            // --- Get Supabase Token ---
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session?.access_token) {
                console.error('WebSocket Auth Error: Could not get session or access token.', sessionError);
                // Decide how to handle this - maybe fallback? For now, block connection.
                setIsConnected(false);
                setUseFallback(true); // Use fallback if auth fails
                setConnectionAttempts(prev => prev + 1);
                return;
            }
            const token = session.access_token;
            // --- Append token to URL ---
            const urlWithToken = `${urlToConnect}?token=${encodeURIComponent(token)}`;

            const currentAttempts = connectionAttemptsRef.current;
            console.log(`Attempting WebSocket connection (Attempt ${currentAttempts + 1}) to URL: ${urlToConnect}`); // Log original URL for clarity
            
            // Validate the *original* URL before appending token
            if (!urlToConnect || !urlToConnect.includes('/ws/portfolio/') || urlToConnect.endsWith('/')) {
                 console.error("Invalid base WebSocket URL provided to connectWebSocket. Aborting connection.", urlToConnect);
                 setIsConnected(false);
                 if (currentAttempts >= 1) { // Keep existing fallback logic for URL errors
                    setUseFallback(true);
                 }
                 setConnectionAttempts(prev => prev + 1);
                 return; 
            }
            
            console.log(`Authenticating WebSocket with URL: ${urlWithToken}`); // Log URL with token separately
            const ws = new WebSocket(urlWithToken); // Use URL with token
            setSocket(ws);

            timeoutRef.current.connection = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.log('WebSocket connection timeout after 10 seconds');
                    ws.close(1000, 'Connection timeout'); // Changed from 1006 to 1000 for normal closure
                }
            }, 10000);
            
            ws.onopen = () => {
                clearTimeout(timeoutRef.current.connection);
                console.log('WebSocket connection established successfully');
                setIsConnected(true);
                setIsLoading(false);
                setConnectionAttempts(0);
                setUseFallback(false);
                
                if (timeoutRef.current.initialFallback) {
                    clearTimeout(timeoutRef.current.initialFallback);
                }
            };
            
            ws.onmessage = (event) => {
                try {
                    if (!isConnectedRef.current) {
                        setIsConnected(true);
                    }
                    
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'heartbeat_ack') {
                        console.log('Received heartbeat acknowledgment from server');
                        return;
                    }
                    
                    if (data.error) {
                        console.error('Received error from WebSocket server:', data.error, data.detail);
                        return;
                    }
                    
                    // Ensure message is for the correct account
                    if (data.account_id === accountId) {
                        setTotalValue(data.total_value);
                        setTodayReturn(data.today_return);
                        setIsLoading(false);
                        setConnectionAttempts(0);
                    } else {
                        console.warn('Received WebSocket message for wrong account:', data.account_id, 'Expected:', accountId);
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };
            
            ws.onclose = (event) => {
                clearTimeout(timeoutRef.current.connection);
                console.log(`WebSocket connection closed, code: ${event.code}, reason: ${event.reason || 'No reason provided'}`, {
                    readyState: ws.readyState, // This might already be CLOSED (3)
                    wasClean: event.wasClean,
                    url: urlToConnect, // Log the URL it tried to connect to
                    timestamp: new Date().toISOString()
                });
                
                setIsConnected(false);
                setSocket(null); // Clear the socket state on close
                
                if (!useFallbackRef.current) {
                    const newAttempts = connectionAttemptsRef.current + 1;
                    setConnectionAttempts(newAttempts);
                    
                    // Code 1006 is "Abnormal Closure" - common when server rejects or connection times out
                    // Code 4001/4003 would indicate our auth failure
                    if ((event.code === 1006 || event.code === 4001 || event.code === 4003) && newAttempts >= 3) { // Increased threshold for fallback, include auth codes
                        console.warn(`Multiple abnormal WebSocket closures (code: ${event.code}) detected, switching to fallback mode`);
                        setUseFallback(true);
                        return; 
                    }
                    
                    const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
                    console.log(`Scheduling reconnect in ${backoffTime}ms due to close event (code: ${event.code})`);
                    timeoutRef.current.reconnect = setTimeout(() => connectWebSocket(urlToConnect), backoffTime); // Reconnect with original base URL
                }
            };
            
            ws.onerror = (event) => {
                clearTimeout(timeoutRef.current.connection);
                // Error events don't usually provide much detail in the event object itself
                console.error('WebSocket connection error occurred', {
                    url: urlToConnect, // Log the URL it tried to connect to
                    timestamp: new Date().toISOString(),
                    readyState: ws.readyState
                });
                
                setIsConnected(false);
                
                // If this is the first error and we haven't tried many times, try fallback immediately
                const currentAttempts = connectionAttemptsRef.current;
                if (currentAttempts === 0) {
                    console.log('First WebSocket connection attempt failed, switching to fallback mode');
                    setUseFallback(true);
                }
                // The 'close' event usually follows 'error', which handles reconnection/fallback
            };
            
        } catch (error) {
            console.error('Error creating WebSocket connection instance:', error);
            setIsConnected(false);
            const newAttempts = connectionAttemptsRef.current + 1;
            setConnectionAttempts(newAttempts);
            
            if (newAttempts >= 3) {
                setUseFallback(true);
            } else {
                const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
                // Pass the original base URL to the reconnect attempt
                timeoutRef.current.reconnect = setTimeout(() => connectWebSocket(urlToConnect), backoffTime); 
            }
        }
    };

    useEffect(() => {
        clearAllTimers();
        if (socketRef.current) {
            socketRef.current.close(1000, 'Component effect re-run or unmount');
        }
        setSocket(null);
        setIsConnected(false);
        setIsLoading(true);
        setConnectionAttempts(0);

        console.log("Running effect for accountId:", accountId, "Portfolio mode:", portfolioMode, "Calculated websocketUrl:", websocketUrl);

        // Skip websockets for aggregation mode - use fallback API
        if (portfolioMode === 'aggregation') {
            console.log("Aggregation mode: Skipping WebSocket, using fallback API for portfolio value");
            setUseFallback(true);
            fetchPortfolioData();
        } else if (websocketUrl && !useFallbackRef.current && shouldUseWebSocket) {
            console.log("Brokerage/Hybrid mode: Attempting WebSocket connection", websocketUrl);
            connectWebSocket(websocketUrl); // Pass the generated base URL (token added inside connectWebSocket)
        } else {
            console.log("Effect triggered: No valid WebSocket URL or fallback mode active, using API fetch.", { accountId, websocketUrl, useFallback: useFallbackRef.current });
            setUseFallback(true); // Ensure fallback state is set
            fetchPortfolioData();
        }
        
        intervalRef.current.heartbeat = setInterval(() => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                try {
                    socketRef.current.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
                } catch (error) {
                    console.error("Error sending heartbeat:", error);
                    // Consider closing connection if heartbeat fails repeatedly
                }
            }
        }, 15000);
        
        let lastReconnectCheckTime = Date.now();
        intervalRef.current.reconnectCheck = setInterval(() => {
            // Skip reconnection attempts for aggregation mode
            if (portfolioMode === 'aggregation' || !shouldUseWebSocket) {
                return;
            }
            
            if (!useFallbackRef.current && !isConnectedRef.current) {
                 const socketObj = socketRef.current;
                 const socketPhysicallyNotConnected = !socketObj || 
                     (socketObj && (socketObj.readyState === WebSocket.CLOSED || socketObj.readyState === WebSocket.CLOSING));
                 
                 if (socketPhysicallyNotConnected && (Date.now() - lastReconnectCheckTime > 30000)) {
                     console.log('Reconnection check interval: WebSocket not connected, attempting reconnect');
                     lastReconnectCheckTime = Date.now();
                     if (websocketUrl) {
                         connectWebSocket(websocketUrl); // Reconnect with base URL
                     }
                 }
            }
        }, 45000);
        
        intervalRef.current.fallbackCheck = setInterval(() => {
            if (useFallbackRef.current) {
                console.log('Fallback interval: Using polling for portfolio data');
                fetchPortfolioData();
                
                // Try to switch back to WebSocket mode occasionally
                const lastAttemptTime = timeoutRef.current.reconnect ? Date.now() : 0; // Crude way to track last reconnect attempt
                if (connectionAttemptsRef.current < 10 && (Date.now() - lastAttemptTime > 60000)) { 
                    console.log("Fallback interval: Attempting to switch back to WebSocket mode");
                    setConnectionAttempts(0); // Reset attempts before trying again
                    setUseFallback(false); // This will trigger the main useEffect which calls connectWebSocket
                }
            }
        }, 30000);
        
        if (!useFallbackRef.current && isLoadingRef.current) {
            timeoutRef.current.initialFallback = setTimeout(async () => {
                if (isLoadingRef.current && !isConnectedRef.current) { // Double check connection status
                    console.warn('Initial WebSocket connection taking too long, fetching data via API (parallel fetch)');
                    await fetchPortfolioData();
                } 
            }, 8000); // Increased timeout slightly
        }
        
        return () => {
            clearAllTimers();
            if (socketRef.current) {
                console.log('Component unmounting, closing WebSocket connection');
                socketRef.current.close(1000, 'Component unmounted');
            }
            setSocket(null);
        };
    // Main effect depends on accountId (to recalculate URL) and websocketUrl (to trigger connection)
    // We don't include connectWebSocket directly as it causes loops
    }, [accountId, websocketUrl, supabase]); // Add supabase to dependency array

    // PRODUCTION-GRADE: Color logic for Today's Return
    // Grey for $0.00 (market closed), Green for positive, Red for negative
    const isZeroReturn = todayReturn.startsWith('$0.00') || todayReturn.startsWith('+$0.00');
    const isPositiveReturn = todayReturn.startsWith('+') && !isZeroReturn;
    const isNegativeReturn = todayReturn.startsWith('-');
    
    const returnColor = isZeroReturn ? 'text-gray-500' : 
                       isPositiveReturn ? 'text-[#22c55e]' : 
                       isNegativeReturn ? 'text-[#ef4444]' : 
                       'text-gray-500'; // Fallback to grey

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Current Value</span>
                <span className="text-2xl font-bold">
                    {isLoading ? 
                        <div className="h-7 w-24 bg-gray-200 animate-pulse rounded-md"></div> :
                        totalValue
                    }
                </span>
            </div>
            <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Today's Return</span>
                <span className={`text-xl font-medium ${isLoading ? '' : returnColor}`}>
                    {isLoading ? 
                        <div className="h-6 w-32 bg-gray-200 animate-pulse rounded-md"></div> :
                        todayReturn
                    }
                </span>
            </div>
            {process.env.NODE_ENV === 'development' && (
                <div className="text-xs text-gray-400 mt-2">
                    {isLoading ? 'Loading data...' :  
                     portfolioMode === 'aggregation' ? 'Portfolio API (aggregated holdings)' :
                     useFallback ? 'Using fallback API (WebSocket unavailable)' : 
                     isConnected ? 'Live updates connected' : 
                     `Connecting (${connectionAttempts})...`}
                </div>
            )}
        </div>
    );
};

export default LivePortfolioValue; 