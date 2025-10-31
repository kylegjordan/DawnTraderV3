import { useState, useEffect, useRef } from 'react';

/**
 * Phase 35.2B - useThrottleData Hook
 * Throttles data updates to prevent excessive re-renders in chart components
 * 
 * @param data - The data to throttle
 * @param delay - Minimum time between updates in milliseconds (default: 1000ms)
 * @returns Throttled data that updates at most once per delay period
 */
export function useThrottleData<T>(data: T, delay: number = 1000): T {
  const [throttledData, setThrottledData] = useState<T>(data);
  const lastUpdateRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate >= delay) {
      // Enough time has passed, update immediately
      setThrottledData(data);
      lastUpdateRef.current = now;
    } else {
      // Schedule update for later
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      const remainingTime = delay - timeSinceLastUpdate;
      timeoutRef.current = setTimeout(() => {
        setThrottledData(data);
        lastUpdateRef.current = Date.now();
      }, remainingTime);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay]);

  return throttledData;
}
