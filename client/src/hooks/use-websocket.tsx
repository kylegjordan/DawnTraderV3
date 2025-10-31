import { useEffect, useRef, useState } from 'react';

export interface WebSocketMessage {
  type: string;
  data?: any;
  payload?: any; // Phase 27.F.14.I: Support payload field for WebSocket messages
}

// Phase 34.A: WebSocket Singleton Pattern - Global instance shared across all hook calls
let globalWs: WebSocket | null = null;
let globalIsConnected = false;
let globalMessages: WebSocketMessage[] = [];
let globalListeners: Set<(messages: WebSocketMessage[]) => void> = new Set();
let globalConnectionListeners: Set<(isConnected: boolean) => void> = new Set();
let reconnectAttempts = 0;
let heartbeatInterval: number | null = null;
let missedPongs = 0;
let activeSubscribers = 0;

const maxReconnectDelay = 30000; // 30 seconds max

export function useWebSocket(url?: string) {
  const [isConnected, setIsConnected] = useState(globalIsConnected);
  const [messages, setMessages] = useState<WebSocketMessage[]>(globalMessages);
  const subscriberIdRef = useRef<number>(0);

  const connect = () => {
    if (globalWs?.readyState === WebSocket.OPEN) return;

    // Get userId from localStorage for Context Bridge registration
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user.id;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let wsUrl = url || `${protocol}//${window.location.host}/ws`;
    
    // Add userId query parameter if available
    if (userId && !url) {
      wsUrl += `?userId=${userId}`;
    }
    
    console.log('[34A][WS] singleton opened once');
    console.log('[ContextBridge] Connecting to WebSocket:', wsUrl);
    globalWs = new WebSocket(wsUrl);

    globalWs.onopen = () => {
      globalIsConnected = true;
      reconnectAttempts = 0; // Reset on successful connection
      missedPongs = 0;
      console.log('[ContextBridge] WebSocket connected', userId ? `(userId: ${userId})` : '');
      
      // Notify all listeners
      globalConnectionListeners.forEach(listener => listener(true));
      
      // Start heartbeat
      startHeartbeat();
    };

    globalWs.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle pong responses
        if (message.type === 'pong') {
          missedPongs = 0;
          return;
        }
        
        globalMessages = [...globalMessages.slice(-49), message]; // Keep last 50 messages
        
        // Notify all listeners with updated messages
        globalListeners.forEach(listener => listener([...globalMessages]));
      } catch (error) {
        console.error('[ContextBridge] WebSocket message parse error:', error);
      }
    };

    globalWs.onclose = () => {
      globalIsConnected = false;
      stopHeartbeat();
      console.log('[ContextBridge] WebSocket disconnected');
      
      // Notify all listeners
      globalConnectionListeners.forEach(listener => listener(false));
      
      // Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
      reconnectAttempts++;
      
      console.log(`[ContextBridge] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
      setTimeout(connect, delay);
    };

    globalWs.onerror = (error) => {
      console.error('[ContextBridge] WebSocket error:', error);
    };
  };

  const startHeartbeat = () => {
    stopHeartbeat(); // Clear any existing interval
    
    heartbeatInterval = window.setInterval(() => {
      if (globalWs?.readyState === WebSocket.OPEN) {
        missedPongs++;
        
        // Close connection if 3 pongs missed
        if (missedPongs >= 3) {
          console.warn('[ContextBridge] 3 heartbeats missed, closing connection');
          globalWs?.close();
          return;
        }
        
        sendMessage({ type: 'ping' });
      }
    }, 25000); // Ping every 25 seconds
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  const disconnect = () => {
    if (globalWs) {
      globalWs.close();
    }
  };

  const sendMessage = (message: WebSocketMessage) => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify(message));
    }
  };

  const subscribe = (type: string, data?: any) => {
    sendMessage({ type, data });
  };

  // Phase 34.A: Subscribe to singleton on mount, unsubscribe on unmount
  useEffect(() => {
    activeSubscribers++;
    subscriberIdRef.current = activeSubscribers;
    
    console.log(`[34A][WS] Subscriber #${subscriberIdRef.current} mounted (total: ${activeSubscribers})`);
    
    // Register listeners for this hook instance
    const messageListener = (msgs: WebSocketMessage[]) => setMessages(msgs);
    const connectionListener = (connected: boolean) => setIsConnected(connected);
    
    globalListeners.add(messageListener);
    globalConnectionListeners.add(connectionListener);
    
    // Initialize connection if this is the first subscriber
    if (activeSubscribers === 1) {
      connect();
    } else {
      // Sync with current global state
      setIsConnected(globalIsConnected);
      setMessages([...globalMessages]);
    }
    
    return () => {
      activeSubscribers--;
      console.log(`[34A][WS] Subscriber #${subscriberIdRef.current} unmounted (remaining: ${activeSubscribers})`);
      
      // Remove listeners
      globalListeners.delete(messageListener);
      globalConnectionListeners.delete(connectionListener);
      
      // Only close connection when LAST subscriber unmounts
      if (activeSubscribers === 0) {
        console.log('[34A][WS] Last subscriber unmounted - closing singleton connection');
        if (globalWs) {
          globalWs.close();
          globalWs = null;
        }
        stopHeartbeat();
      }
    };
  }, [url]);

  return {
    isConnected,
    messages,
    sendMessage,
    subscribe,
    connect,
    disconnect
  };
}
