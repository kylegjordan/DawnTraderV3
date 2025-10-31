/**
 * Phase 35.1 - Profiled Route Wrapper
 * Wraps routes with React Profiler for performance monitoring
 */

import { Profiler, ComponentType, useEffect } from 'react';
import { performanceProfiler } from '@/utils/performance-profiler';

interface ProfiledRouteProps {
  component: ComponentType<any>;
  id: string;
  [key: string]: any;
}

export function ProfiledRoute({ component: Component, id, ...props }: ProfiledRouteProps) {
  // Mark mount start before render
  useEffect(() => {
    performanceProfiler.markMountStart(id);
  }, []);

  return (
    <Profiler id={id} onRender={performanceProfiler.onRender}>
      <Component {...props} />
    </Profiler>
  );
}
