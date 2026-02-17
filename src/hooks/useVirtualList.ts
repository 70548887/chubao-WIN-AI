import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

export interface VirtualListOptions<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
}

export interface VirtualListState {
  startIndex: number;
  endIndex: number;
  virtualItems: { index: number; item: any; style: React.CSSProperties }[];
  totalHeight: number;
  scrollTop: number;
}

export function useVirtualList<T>(options: VirtualListOptions<T>) {
  const { items, itemHeight, overscan = 5, containerHeight } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算可见范围
  const { startIndex, endIndex, virtualItems, totalHeight } = useMemo(() => {
    const totalItems = items.length;
    const totalHeight = totalItems * itemHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + overscan * 2);

    const virtualItems = [];
    for (let i = startIndex; i <= endIndex; i++) {
      virtualItems.push({
        index: i,
        item: items[i],
        style: {
          position: 'absolute' as const,
          top: i * itemHeight,
          height: itemHeight,
          left: 0,
          right: 0,
        },
      });
    }

    return { startIndex, endIndex, virtualItems, totalHeight };
  }, [items, itemHeight, scrollTop, containerHeight, overscan]);

  // 滚动处理
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // 滚动到指定索引
  const scrollToIndex = useCallback((index: number) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = index * itemHeight;
    }
  }, [itemHeight]);

  // 滚动到顶部
  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = items.length * itemHeight;
    }
  }, [items.length, itemHeight]);

  return {
    containerRef,
    virtualItems,
    totalHeight,
    startIndex,
    endIndex,
    scrollTop,
    handleScroll,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
  };
}

// 懒加载 Hook
export interface LazyLoadOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useLazyLoad(options: LazyLoadOptions = {}) {
  const { threshold = 0, rootMargin = '0px', triggerOnce = true } = options;

  const [isInView, setIsInView] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    if (triggerOnce && hasTriggered) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          setHasTriggered(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce, hasTriggered]);

  return { ref: elementRef, isInView, hasTriggered };
}

// 缓存 Hook
export function useCache<T>(key: string, maxAge: number = 5 * 60 * 1000) {
  const getCached = useCallback((): T | null => {
    try {
      const stored = localStorage.getItem(`cache_${key}`);
      if (!stored) return null;

      const { value, timestamp } = JSON.parse(stored);
      if (Date.now() - timestamp > maxAge) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }, [key, maxAge]);

  const setCached = useCallback((value: T) => {
    try {
      localStorage.setItem(
        `cache_${key}`,
        JSON.stringify({ value, timestamp: Date.now() })
      );
    } catch (error) {
      console.warn('Failed to cache data:', error);
    }
  }, [key]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(`cache_${key}`);
  }, [key]);

  return { getCached, setCached, clearCache };
}

// 防抖 Hook
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

// 节流 Hook
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  const inThrottleRef = useRef(false);

  return useCallback(
    (...args: Parameters<T>) => {
      if (!inThrottleRef.current) {
        callback(...args);
        inThrottleRef.current = true;
        setTimeout(() => {
          inThrottleRef.current = false;
        }, limit);
      }
    },
    [callback, limit]
  );
}

// 内存优化 Hook - 清理未使用的数据
export function useMemoryCleanup<T>(
  data: T[],
  maxItems: number = 1000
): T[] {
  return useMemo(() => {
    if (data.length <= maxItems) return data;
    return data.slice(-maxItems);
  }, [data, maxItems]);
}
