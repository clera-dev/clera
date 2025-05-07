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
    
    // Store timeouts and intervals in refs so they persist across renders
    const timeoutRef = useRef<TimerRefs>({});
    const intervalRef = useRef<TimerRefs>({});
    
    // Cleanup function to clear all timeouts and intervals
    const clearAllTimers = () => {
        Object.values(timeoutRef.current).forEach(timeout => 
            clearTimeout(timeout as NodeJS.Timeout));
        Object.values(intervalRef.current).forEach(interval => 
            clearInterval(interval as NodeJS.Timeout));
        timeoutRef.current = {};
        intervalRef.current = {};
    };

    // Function to fetch data via REST API fallback
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
        return false;
    };

    // Function to attempt WebSocket connection
    const connectWebSocket = () => {
        // Only create a new connection if we don't have one already
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return;
        }
        
        try {
            // Check if accountId is valid before attempting to connect
            if (!accountId || accountId === 'undefined') {
                console.log('Invalid account ID, cannot connect to WebSocket');
                setIsConnected(false);
                setUseFallback(true);
                return;
            }
            
            // Use relative URL through Next.js proxy - this will be rewritten based on next.config.mjs
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host; // Include port if present
            const websocketUrl = `${protocol}//${host}/ws/portfolio/${accountId}`;
            
            console.log(`Connecting to WebSocket at ${websocketUrl} (attempt ${connectionAttempts + 1})`);
            
            const ws = new WebSocket(websocketUrl);
            
            // Set a connection timeout
            timeoutRef.current.connection = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.log('WebSocket connection timeout');
                    ws.close();
                    
                    // Check if we should switch to fallback mode after several failed attempts
                    const newAttempts = connectionAttempts + 1;
                    setConnectionAttempts(newAttempts);
                    
                    // If we've failed multiple times, use the fallback approach
                    if (newAttempts >= 3) {
                        console.log('Multiple WebSocket connection failures, switching to fallback mode');
                        setUseFallback(true);
                        
                        // Try again less frequently
                        timeoutRef.current.reconnect = setTimeout(connectWebSocket, 60000); // Try reconnecting every minute
                    } else {
                        // Calculate backoff time (2s, 4s, 8s, up to 30s max)
                        const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
                        timeoutRef.current.reconnect = setTimeout(connectWebSocket, backoffTime);
                    }
                }
            }, 8000); // Increased timeout for production environment
            
            // Connection opened
            ws.addEventListener('open', () => {
                clearTimeout(timeoutRef.current.connection);
                console.log('WebSocket connection established successfully');
                setIsConnected(true);
                setIsLoading(false);
                setConnectionAttempts(0); // Reset connection attempts on success
                setUseFallback(false); // No longer need fallback mode
            });
            
            // Listen for messages
            ws.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Handle heartbeat response if present
                    if (data.type === 'heartbeat_ack') {
                        console.log('Received heartbeat acknowledgment from server');
                        return;
                    }
                    
                    // Handle error messages
                    if (data.error) {
                        console.error('Received error from WebSocket server:', data.error, data.detail);
                        return;
                    }
                    
                    // Handle portfolio data updates
                    if (data.account_id === accountId) {
                        setTotalValue(data.total_value);
                        setTodayReturn(data.today_return);
                        setIsLoading(false);
                    }
                } catch (error) {
                    console.log('Error parsing WebSocket message:', error);
                }
            });
            
            // Connection closed
            ws.addEventListener('close', (event) => {
                clearTimeout(timeoutRef.current.connection);
                // Add more detailed logging for connection closure
                console.log(`WebSocket connection closed, code: ${event.code}, reason: ${event.reason || 'No reason provided'}`, {
                    readyState: ws.readyState,
                    wasClean: event.wasClean,
                    timestamp: new Date().toISOString()
                });
                
                setIsConnected(false);
                
                // Try to reconnect after a delay, with exponential backoff
                const newAttempts = connectionAttempts + 1;
                setConnectionAttempts(newAttempts);
                
                // If closed with code 1006 (abnormal closure) repeatedly, use fallback
                if (event.code === 1006 && newAttempts >= 2) {
                    console.log('Abnormal WebSocket closures detected, switching to fallback mode');
                    setUseFallback(true);
                }
                
                // Calculate backoff time (2s, 4s, 8s, up to 30s max)
                const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
                timeoutRef.current.reconnect = setTimeout(connectWebSocket, backoffTime);
            });
            
            // Handle errors
            ws.addEventListener('error', (event) => {
                clearTimeout(timeoutRef.current.connection);
                // Add more detailed error logging
                console.error('WebSocket connection error occurred', {
                    readyState: ws.readyState,
                    url: websocketUrl,
                    timestamp: new Date().toISOString()
                });
                
                setIsConnected(false);
                // Don't try to reconnect here - the close event will fire after error
            });
            
            setSocket(ws);
        } catch (error) {
            console.log('Error creating WebSocket connection:', error);
            // Ensure we try to reconnect even after a connection creation error
            const newAttempts = connectionAttempts + 1;
            setConnectionAttempts(newAttempts);
            
            // After multiple failures, switch to fallback mode
            if (newAttempts >= 3) {
                setUseFallback(true);
            }
            
            const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
            timeoutRef.current.reconnect = setTimeout(connectWebSocket, backoffTime);
        }
    };

    // Set up WebSocket connection and fallback polling
    useEffect(() => {
        // Clean up any existing connections
        clearAllTimers();
        if (socket) {
            socket.close(1000, 'Refreshing connection');
        }
        
        // Initial connection or fetch data
        if (useFallback) {
            fetchPortfolioData();
        } else {
            connectWebSocket();
        }
        
        // Set up heartbeat interval
        intervalRef.current.heartbeat = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                // Send a JSON heartbeat message
                socket.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
            }
        }, 15000); // Send ping every 15 seconds
        
        // Set up reconnection check
        intervalRef.current.reconnect = setInterval(() => {
            if (!useFallback && (!isConnected || (socket && socket.readyState !== WebSocket.OPEN))) {
                console.log('Reconnection check: WebSocket not connected, attempting reconnect');
                connectWebSocket();
            }
        }, 45000); // Check connection every 45 seconds
        
        // Set up fallback data polling
        intervalRef.current.fallback = setInterval(() => {
            if (useFallback) {
                console.log('Using fallback polling for portfolio data');
                fetchPortfolioData();
                
                // Periodically try to reconnect WebSocket even in fallback mode
                if (connectionAttempts < 10) { // Limit reconnection attempts
                    connectWebSocket();
                }
            }
        }, 30000); // Poll for data every 30 seconds in fallback mode
        
        // Fallback to fetch data if WebSocket takes too long initially
        if (!useFallback && isLoading) {
            timeoutRef.current.initialFallback = setTimeout(async () => {
                if (isLoading) {
                    console.log('Initial WebSocket connection taking too long, fetching data via API');
                    await fetchPortfolioData();
                }
            }, 3000);
        }
        
        // Cleanup
        return () => {
            clearAllTimers();
            
            if (socket) {
                console.log('Component unmounting, closing WebSocket connection');
                socket.close(1000, 'Component unmounted');
            }
        };
    }, [accountId, useFallback]); // Re-run effect if accountId or fallback mode changes

    // Determine if today's return is positive or negative
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
                    {isLoading ? 'Loading data...' : 
                     useFallback ? 'Using fallback API (WebSocket unavailable)' :
                     isConnected ? 'Live updates connected' : 
                     `Connecting to live updates... ${connectionAttempts > 0 ? `(Attempt ${connectionAttempts})` : ''}`}
                </div>
            )}
        </div>
    );
};

export default LivePortfolioValue; 