import { EventEmitter } from 'events';

/**
 * Performance metrics collector for Node backend
 * Tracks memory usage, request latency, and tool execution times
 */

export interface PerformanceMetrics {
  timestamp: number;
  memory: NodeJS.MemoryUsage;
  cpuUsage: number;
  requestCount: number;
  averageLatency: number;
  activeConnections: number;
}

export interface ToolMetrics {
  toolName: string;
  executionCount: number;
  averageExecutionTime: number;
  errorCount: number;
  lastExecutionTime: number;
}

export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics[] = [];
  private toolMetrics: Map<string, ToolMetrics> = new Map();
  private requestCount = 0;
  private totalLatency = 0;
  private activeConnections = 0;
  private maxMetricsHistory = 100;
  private collectionInterval: NodeJS.Timeout | null = null;

  startCollection(intervalMs = 60000): void {
    if (this.collectionInterval) return;

    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    // Initial collection
    this.collectMetrics();
  }

  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  private collectMetrics(): void {
    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      requestCount: this.requestCount,
      averageLatency: this.requestCount > 0 ? this.totalLatency / this.requestCount : 0,
      activeConnections: this.activeConnections,
    };

    this.metrics.push(metrics);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    // Emit warning if memory usage is high
    const heapUsedMB = metrics.memory.heapUsed / 1024 / 1024;
    if (heapUsedMB > 512) {
      this.emit('warning', {
        type: 'high_memory',
        message: `Heap usage is ${heapUsedMB.toFixed(2)} MB`,
        metrics,
      });
    }

    this.emit('metrics', metrics);
  }

  recordRequest(latencyMs: number): void {
    this.requestCount++;
    this.totalLatency += latencyMs;
  }

  recordToolExecution(toolName: string, executionTimeMs: number, success: boolean): void {
    let toolMetric = this.toolMetrics.get(toolName);

    if (!toolMetric) {
      toolMetric = {
        toolName,
        executionCount: 0,
        averageExecutionTime: 0,
        errorCount: 0,
        lastExecutionTime: 0,
      };
      this.toolMetrics.set(toolName, toolMetric);
    }

    toolMetric.executionCount++;
    toolMetric.lastExecutionTime = executionTimeMs;

    // Update running average
    toolMetric.averageExecutionTime =
      (toolMetric.averageExecutionTime * (toolMetric.executionCount - 1) + executionTimeMs) /
      toolMetric.executionCount;

    if (!success) {
      toolMetric.errorCount++;
    }
  }

  incrementConnections(): void {
    this.activeConnections++;
  }

  decrementConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  getCurrentMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getMetricsHistory(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getToolMetrics(): ToolMetrics[] {
    return Array.from(this.toolMetrics.values());
  }

  getSummary(): object {
    const current = this.getCurrentMetrics();
    const toolMetrics = this.getToolMetrics();

    return {
      timestamp: new Date().toISOString(),
      memory: current
        ? {
            heapUsedMB: (current.memory.heapUsed / 1024 / 1024).toFixed(2),
            heapTotalMB: (current.memory.heapTotal / 1024 / 1024).toFixed(2),
            rssMB: (current.memory.rss / 1024 / 1024).toFixed(2),
          }
        : null,
      requests: {
        total: this.requestCount,
        averageLatencyMs: current?.averageLatency.toFixed(2) ?? 0,
      },
      connections: {
        active: this.activeConnections,
      },
      tools: {
        total: toolMetrics.length,
        topByExecution: toolMetrics
          .sort((a, b) => b.executionCount - a.executionCount)
          .slice(0, 5)
          .map((t) => ({
            name: t.toolName,
            count: t.executionCount,
            avgTime: t.averageExecutionTime.toFixed(2),
            errors: t.errorCount,
          })),
      },
    };
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();
