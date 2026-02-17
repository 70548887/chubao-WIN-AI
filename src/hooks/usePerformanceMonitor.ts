import { useState, useEffect, useCallback, useRef } from 'react';

export interface PerformanceMetrics {
  fps: number;
  memory: {
    used: number;
    total: number;
    limit: number;
  } | null;
  timing: {
    domContentLoaded: number;
    loadComplete: number;
  } | null;
}

export function usePerformanceMonitor(enabled: boolean = true) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    memory: null,
    timing: null,
  });

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef<number>();

  // FPS 计算
  useEffect(() => {
    if (!enabled) return;

    const calculateFPS = () => {
      frameCountRef.current++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTimeRef.current;

      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed);
        setMetrics((prev) => ({ ...prev, fps }));
        frameCountRef.current = 0;
        lastTimeRef.current = currentTime;
      }

      rafRef.current = requestAnimationFrame(calculateFPS);
    };

    rafRef.current = requestAnimationFrame(calculateFPS);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled]);

  // 内存监控
  useEffect(() => {
    if (!enabled) return;

    const updateMemory = () => {
      const memory = (performance as any).memory;
      if (memory) {
        setMetrics((prev) => ({
          ...prev,
          memory: {
            used: Math.round(memory.usedJSHeapSize / 1048576),
            total: Math.round(memory.totalJSHeapSize / 1048576),
            limit: Math.round(memory.jsHeapSizeLimit / 1048576),
          },
        }));
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 5000);

    return () => clearInterval(interval);
  }, [enabled]);

  // 页面加载时间
  useEffect(() => {
    if (!enabled) return;

    const updateTiming = () => {
      const timing = performance.timing;
      if (timing) {
        setMetrics((prev) => ({
          ...prev,
          timing: {
            domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
            loadComplete: timing.loadEventEnd - timing.navigationStart,
          },
        }));
      }
    };

    if (document.readyState === 'complete') {
      updateTiming();
    } else {
      window.addEventListener('load', updateTiming);
      return () => window.removeEventListener('load', updateTiming);
    }
  }, [enabled]);

  // 测量函数执行时间
  const measure = useCallback(<T extends (...args: any[]) => any>(
    fn: T,
    name: string
  ): ((...args: Parameters<T>) => ReturnType<T>) => {
    return (...args: Parameters<T>): ReturnType<T> => {
      const start = performance.now();
      const result = fn(...args);
      const end = performance.now();
      console.log(`[Performance] ${name}: ${(end - start).toFixed(2)}ms`);
      return result;
    };
  }, []);

  return { metrics, measure };
}

// 组件渲染性能追踪
export function useRenderCount(name: string) {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current++;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Render] ${name} rendered ${renderCount.current} times`);
    }
  });

  return renderCount.current;
}

// 长任务监控
export function useLongTaskMonitor(enabled: boolean = true, threshold: number = 50) {
  const [longTasks, setLongTasks] = useState<PerformanceEntry[]>([]);

  useEffect(() => {
    if (!enabled || !('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries().filter(
        (entry) => entry.duration > threshold
      );
      if (entries.length > 0) {
        setLongTasks((prev) => [...prev, ...entries]);
      }
    });

    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // 浏览器不支持 longtask
    }

    return () => observer.disconnect();
  }, [enabled, threshold]);

  return longTasks;
}

// 资源加载监控
export function useResourceMonitor(enabled: boolean = true) {
  const [resources, setResources] = useState<PerformanceResourceTiming[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const updateResources = () => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      setResources(entries);
    };

    updateResources();

    const observer = new PerformanceObserver(updateResources);
    try {
      observer.observe({ entryTypes: ['resource'] });
    } catch {
      // 浏览器不支持
    }

    return () => observer.disconnect();
  }, [enabled]);

  return resources;
}
