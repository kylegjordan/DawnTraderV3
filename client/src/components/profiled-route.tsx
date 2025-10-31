/**
 * Phase 35.1 - Profiled Route Wrapper
 * Wraps routes with React Profiler for performance monitoring
 */

import { Profiler, ComponentType, useMemo } from 'react';
import { performanceProfiler } from '@/utils/performance-profiler';

interface ProfiledRouteProps {
  component: ComponentType<any>;
  id: string;
  [key: string]: any;
}

export function ProfiledRoute({ component: Component, id, ...props }: ProfiledRouteProps) {
  // Mark mount start BEFORE first render using useMemo (runs synchronously before render)
  useMemo(() => {
    performanceProfiler.markMountStart(id);
    return null;
  }, [id]);

  return (
    <Profiler id={id} onRender={performanceProfiler.onRender}>
      <Component {...props} />
    </Profiler>
  );
}
