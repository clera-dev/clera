"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LivePortfolioValueProps {
    accountId: string;
}

interface TimerRefs {
    [key: string]: number | NodeJS.Timeout;
}

const LivePortfolioValue: React.FC<LivePortfolioValueProps> = ({ accountId }) => {
    const [totalValue, setTotalValue] = useState<string>("$0.00");
    const [todayReturn, setTodayReturn] = useState<string>("+$0.00 (0.00%)");
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
    const [useFallback, setUseFallback] = useState<boolean>(false);
    
    const timeoutRef = useRef<TimerRefs>({});
    const intervalRef = useRef<TimerRefs>({});

    // Refs to hold the latest values of state for intervals/timeouts
    const socketRef = useRef<WebSocket | null>(socket);
    const isConnectedRef = useRef<boolean>(isConnected);
    const useFallbackRef = useRef<boolean>(useFallback);
    const connectionAttemptsRef = useRef<number>(connectionAttempts);
    const isLoadingRef = useRef<boolean>(isLoading);

    // Keep refs synchronized with state
    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    useEffect(() => {
        isConnectedRef.current = isConnected;
    }, [isConnected]);

    useEffect(() => {
        useFallbackRef.current = useFallback;
    }, [useFallback]);

    useEffect(() => {
        connectionAttemptsRef.current = connectionAttempts;
    }, [connectionAttempts]);

    useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);
    
    const clearAllTimers = () => {
        Object.values(timeoutRef.current).forEach(timeout => 
            clearTimeout(timeout as NodeJS.Timeout));
        Object.values(intervalRef.current).forEach(interval => 
            clearInterval(interval as NodeJS.Timeout));
        timeoutRef.current = {};
        intervalRef.current = {};
    };

    const fetchPortfolioData = async () => {
        try {
            const response = await fetch(`/api/portfolio/value?accountId=${accountId}`);
            if (response.ok) {
                const data = await response.json();
                setTotalValue(data.total_value);
                setTodayReturn(data.today_return);
                setIsLoading(false);
                return true;
            }
        } catch (error) {
            console.log('Error fetching portfolio data:', error);
        }
        setIsLoading(false); // Ensure loading is set to false even on error
        return false;
    };

    const connectWebSocket = () => {
        if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
            console.log('WebSocket already connecting or connected (socketRef), skipping new connection attempt');
            return;
        }
        
        if (isConnectedRef.current && socketRef.current) {
            console.log('WebSocket already marked as connected (isConnectedRef), skipping new connection attempt');
            return;
        }
        
        try {
            if (!accountId || accountId === 'undefined') {
                console.log('Invalid account ID, cannot connect to WebSocket');
                setIsConnected(false);
                setUseFallback(true);
                return;
            }
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const websocketUrl = `${protocol}//${host}/ws/portfolio/${accountId}`;
            
            const currentAttempts = connectionAttemptsRef.current;
            console.log(`Connecting to WebSocket at ${websocketUrl} (attempt ${currentAttempts + 1})`);
            
            const ws = new WebSocket(websocketUrl);
            setSocket(ws); // This will update socketRef via its useEffect

            timeoutRef.current.connection = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.log('WebSocket connection timeout after 10 seconds');
                    ws.close(); // This will trigger the 'close' event listener
                    
                    // Fallback logic moved to 'close' listener to avoid duplication
                }
            }, 10000);
            
            ws.addEventListener('open', () => {
                clearTimeout(timeoutRef.current.connection);
                console.log('WebSocket connection established successfully');
                setIsConnected(true); // This will update isConnectedRef
                setIsLoading(false);
                setConnectionAttempts(0); // Reset attempts
                setUseFallback(false); // Back to WebSocket mode
                
                if (timeoutRef.current.initialFallback) {
                    clearTimeout(timeoutRef.current.initialFallback);
                }
            });
            
            ws.addEventListener('message', (event) => {
                try {
                    if (!isConnectedRef.current) { // Use ref here
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
                    
                    if (data.account_id === accountId) {
                        setTotalValue(data.total_value);
                        setTodayReturn(data.today_return);
                        setIsLoading(false);
                        setConnectionAttempts(0); // Reset on successful data
                    }
                } catch (error) {
                    console.log('Error parsing WebSocket message:', error);
                }
            });
            
            ws.addEventListener('close', (event) => {
                clearTimeout(timeoutRef.current.connection);
                console.log(`WebSocket connection closed, code: ${event.code}, reason: ${event.reason || 'No reason provided'}`, {
                    readyState: ws.readyState,
                    wasClean: event.wasClean,
                    timestamp: new Date().toISOString()
                });
                
                setIsConnected(false); // Update state and ref
                
                if (!useFallbackRef.current) { // Only attempt reconnect if not already in fallback mode
                    const newAttempts = connectionAttemptsRef.current + 1;
                    setConnectionAttempts(newAttempts);
                    
                    if (event.code === 1006 && newAttempts >= 2) {
                        console.log('Abnormal WebSocket closures detected, switching to fallback mode');
                        setUseFallback(true);
                        return; 
                    }
                    
                    const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
                    console.log(`Scheduling reconnect in ${backoffTime}ms due to close event`);
                    timeoutRef.current.reconnect = setTimeout(connectWebSocket, backoffTime);
                }
            });
            
            ws.addEventListener('error', (event) => {
                clearTimeout(timeoutRef.current.connection);
                console.error('WebSocket connection error occurred', {
                    readyState: ws.readyState, // ws might be stale here, use socketRef.current
                    url: websocketUrl,
                    timestamp: new Date().toISOString()
                });
                
                setIsConnected(false); // Update state and ref
                // The 'close' event usually follows 'error', which will handle reconnection logic.
            });
            
        } catch (error) {
            console.log('Error creating WebSocket connection instance:', error);
            setIsConnected(false);
            const newAttempts = connectionAttemptsRef.current + 1;
            setConnectionAttempts(newAttempts);
            
            if (newAttempts >= 3) {
                setUseFallback(true);
            } else {
                const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
                timeoutRef.current.reconnect = setTimeout(connectWebSocket, backoffTime);
            }
        }
    };

    useEffect(() => {
        clearAllTimers();
        if (socketRef.current) { // Use ref
            socketRef.current.close(1000, 'Component effect re-run or unmount');
        }
        setSocket(null); // Clear the actual socket state
        
        setIsConnected(false);
        setIsLoading(true);
        setConnectionAttempts(0); // Reset attempts when accountId changes

        if (useFallbackRef.current) { // Use ref
            fetchPortfolioData();
        } else {
            connectWebSocket();
        }
        
        intervalRef.current.heartbeat = setInterval(() => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) { // Use ref
                socketRef.current.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
            }
        }, 15000);
        
        let lastReconnectTime = Date.now();
        intervalRef.current.reconnect = setInterval(() => {
            const currentTime = Date.now();
            
            const socketObj = socketRef.current; // Use ref
            const connected = isConnectedRef.current; // Use ref
            const fallbackActive = useFallbackRef.current; // Use ref

            const socketPhysicallyNotConnected = !socketObj || 
                (socketObj && (socketObj.readyState === WebSocket.CLOSED || socketObj.readyState === WebSocket.CLOSING));
            
            if (!fallbackActive && socketPhysicallyNotConnected && !connected &&
                (currentTime - lastReconnectTime > 30000)) {
                console.log('Reconnection check interval: WebSocket not connected (using refs), attempting reconnect');
                lastReconnectTime = currentTime;
                connectWebSocket();
            }
        }, 45000);
        
        intervalRef.current.fallback = setInterval(() => {
            if (useFallbackRef.current) { // Use ref
                console.log('Using fallback polling for portfolio data');
                fetchPortfolioData();
                
                const currentTime = Date.now();
                if (connectionAttemptsRef.current < 10 && (currentTime - lastReconnectTime > 60000)) { 
                    lastReconnectTime = currentTime;
                    console.log("Attempting to switch back to WebSocket from fallback mode.");
                    setUseFallback(false); // This will trigger the main useEffect to re-evaluate
                    // connectWebSocket(); // connectWebSocket will be called by the main useEffect
                }
            }
        }, 30000);
        
        if (!useFallbackRef.current && isLoadingRef.current) { // Use refs
            timeoutRef.current.initialFallback = setTimeout(async () => {
                if (isLoadingRef.current) { // Use ref
                    console.log('Initial WebSocket connection taking too long, fetching data via API (parallel fetch)');
                    await fetchPortfolioData();
                } 
            }, 6000);
        }
        
        return () => {
            clearAllTimers();
            if (socketRef.current) { // Use ref
                console.log('Component unmounting, closing WebSocket connection (socketRef)');
                socketRef.current.close(1000, 'Component unmounted');
            }
            setSocket(null); // Also clear the state
        };
    }, [accountId]); // Rerun main effect ONLY when accountId changes. Fallback changes handled internally or trigger this.

    const isPositiveReturn = !todayReturn.startsWith('-');
    const returnColor = isPositiveReturn ? 'text-[#22c55e]' : 'text-[#ef4444]';

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
                    {isLoadingRef.current ? 'Loading data...' :  // Use ref for display if needed
                     useFallbackRef.current ? 'Using fallback API (WebSocket unavailable)' : // Use ref
                     isConnectedRef.current ? 'Live updates connected' : // Use ref
                     `Connecting to live updates... ${connectionAttemptsRef.current > 0 ? `(Attempt ${connectionAttemptsRef.current})` : ''}`}
                </div>
            )}
        </div>
    );
};

export default LivePortfolioValue; 