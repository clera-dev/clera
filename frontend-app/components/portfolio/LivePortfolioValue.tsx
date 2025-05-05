"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LivePortfolioValueProps {
    accountId: string;
}

const LivePortfolioValue: React.FC<LivePortfolioValueProps> = ({ accountId }) => {
    const [totalValue, setTotalValue] = useState<string>("$0.00");
    const [todayReturn, setTodayReturn] = useState<string>("+$0.00 (0.00%)");
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [connectionAttempts, setConnectionAttempts] = useState<number>(0);

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
                return;
            }
            
            // Use relative URL through Next.js proxy - this will be rewritten based on next.config.mjs
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host; // Include port if present
            const websocketUrl = `${protocol}//${host}/ws/portfolio/${accountId}`;
            
            console.log(`Connecting to WebSocket at ${websocketUrl} (attempt ${connectionAttempts + 1})`);
            
            const ws = new WebSocket(websocketUrl);
            
            // Set a connection timeout
            const connectionTimeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.log('WebSocket connection timeout');
                    ws.close();
                    
                    // Try again with an incremented attempt count
                    const newAttempts = connectionAttempts + 1;
                    setConnectionAttempts(newAttempts);
                    setTimeout(connectWebSocket, Math.min(2000 * newAttempts, 10000));
                }
            }, 5000);
            
            // Connection opened
            ws.addEventListener('open', () => {
                clearTimeout(connectionTimeout);
                console.log('WebSocket connection established successfully');
                setIsConnected(true);
                setIsLoading(false);
                setConnectionAttempts(0); // Reset connection attempts on success
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
                clearTimeout(connectionTimeout);
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
                
                // Calculate backoff time (1s, 2s, 4s, 8s, up to 30s max)
                const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
                setTimeout(connectWebSocket, backoffTime);
            });
            
            // Handle errors
            ws.addEventListener('error', (event) => {
                clearTimeout(connectionTimeout);
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
            const backoffTime = Math.min(Math.pow(2, newAttempts) * 1000, 30000);
            setTimeout(connectWebSocket, backoffTime);
        }
    };

    useEffect(() => {
        // Initial connection
        connectWebSocket();
        
        // Set up ping interval to keep connection alive
        const pingInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                // Send a JSON heartbeat message
                socket.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
            }
        }, 15000); // Send ping every 15 seconds
        
        // Add a reconnection mechanism in case the connection is lost
        const reconnectInterval = setInterval(() => {
            if (!isConnected || (socket && socket.readyState !== WebSocket.OPEN)) {
                console.log('Reconnection check: WebSocket not connected, attempting reconnect');
                connectWebSocket();
            }
        }, 45000); // Check connection every 45 seconds
        
        // Cleanup
        return () => {
            clearInterval(pingInterval);
            clearInterval(reconnectInterval);
            
            if (socket) {
                console.log('Component unmounting, closing WebSocket connection');
                socket.close(1000, 'Component unmounted');
            }
        };
    }, [accountId, isConnected]); // Re-run effect if accountId changes
    
    // Fallback to fetch data if WebSocket fails
    useEffect(() => {
        // If we're loading for more than 3 seconds, try to fetch data via API
        let timeoutId: NodeJS.Timeout;
        
        if (isLoading) {
            timeoutId = setTimeout(async () => {
                try {
                    // Fallback to REST API if WebSocket is taking too long
                    const response = await fetch(`/api/portfolio/value?accountId=${accountId}`);
                    if (response.ok) {
                        const data = await response.json();
                        setTotalValue(data.total_value);
                        setTodayReturn(data.today_return);
                        setIsLoading(false);
                    }
                } catch (error) {
                    console.log('Error fetching portfolio data:', error);
                }
            }, 3000);
        }
        
        return () => {
            clearTimeout(timeoutId);
        };
    }, [isLoading, accountId]);

    // Display connection status for debugging during development
    const debugInfo = process.env.NODE_ENV === 'development' ? (
        <div className="text-xs text-gray-400 mt-2">
            {isLoading ? 'Loading data...' : 
             isConnected ? 'Live updates connected' : 
             `Connecting to live updates... ${connectionAttempts > 0 ? `(Attempt ${connectionAttempts})` : ''}`}
        </div>
    ) : null;

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
            {debugInfo}
        </div>
    );
};

export default LivePortfolioValue; 