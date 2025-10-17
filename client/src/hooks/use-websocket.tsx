import { useEffect, useRef, useState } from 'react';

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export function useWebSocket(url?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef<number>(0);
  const maxReconnectDelay = 30000; // 30 seconds max
  const heartbeatInterval = useRef<number | null>(null);
  const missedPongs = useRef<number>(0);

  const connect = () => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    // Get userId from localStorage for Context Bridge registration
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user.id;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let wsUrl = url || `${protocol}//${window.location.host}/ws`;
    
    // Add userId query parameter if available
    if (userId && !url) {
      wsUrl += `?userId=${userId}`;
    }
    
    console.log('[ContextBridge] Connecting to WebSocket:', wsUrl);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0; // Reset on successful connection
      missedPongs.current = 0;
      console.log('[ContextBridge] WebSocket connected', userId ? `(userId: ${userId})` : '');
      
      // Start heartbeat
      startHeartbeat();
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle pong responses
        if (message.type === 'pong') {
          missedPongs.current = 0;
          return;
        }
        
        setMessages(prev => [...prev.slice(-49), message]); // Keep last 50 messages
      } catch (error) {
        console.error('[ContextBridge] WebSocket message parse error:', error);
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      stopHeartbeat();
      console.log('[ContextBridge] WebSocket disconnected');
      
      // Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), maxReconnectDelay);
      reconnectAttempts.current++;
      
      console.log(`[ContextBridge] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})...`);
      setTimeout(connect, delay);
    };

    ws.current.onerror = (error) => {
      console.error('[ContextBridge] WebSocket error:', error);
    };
  };

  const startHeartbeat = () => {
    stopHeartbeat(); // Clear any existing interval
    
    heartbeatInterval.current = window.setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        missedPongs.current++;
        
        // Close connection if 3 pongs missed
        if (missedPongs.current >= 3) {
          console.warn('[ContextBridge] 3 heartbeats missed, closing connection');
          ws.current?.close();
          return;
        }
        
        sendMessage({ type: 'ping' });
      }
    }, 25000); // Ping every 25 seconds
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  };

  const disconnect = () => {
    if (ws.current) {
      ws.current.close();
    }
  };

  const sendMessage = (message: WebSocketMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  const subscribe = (type: string, data?: any) => {
    sendMessage({ type, data });
  };

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url]);

  // Ping every 30 seconds to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        sendMessage({ type: 'ping' });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    isConnected,
    messages,
    sendMessage,
    subscribe,
    connect,
    disconnect
  };
}
