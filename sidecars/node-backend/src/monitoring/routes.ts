import { Router } from 'express';
import { performanceMonitor } from './performance.js';

/**
 * Monitoring and metrics API routes
 */

export function createMonitoringRouter(): Router {
  const router = Router();

  // Get current performance metrics
  router.get('/metrics', (_req, res) => {
    const metrics = performanceMonitor.getCurrentMetrics();
    if (!metrics) {
      return res.status(503).json({
        success: false,
        error: 'Metrics collection not started',
      });
    }

    res.json({
      success: true,
      metrics: {
        timestamp: new Date(metrics.timestamp).toISOString(),
        memory: {
          heapUsed: `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(metrics.memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          rss: `${(metrics.memory.rss / 1024 / 1024).toFixed(2)} MB`,
          external: `${(metrics.memory.external / 1024 / 1024).toFixed(2)} MB`,
        },
        cpuUsage: `${metrics.cpuUsage.toFixed(2)}s`,
        requests: {
          count: metrics.requestCount,
          averageLatency: `${metrics.averageLatency.toFixed(2)}ms`,
        },
        connections: metrics.activeConnections,
      },
    });
  });

  // Get metrics history
  router.get('/metrics/history', (_req, res) => {
    const history = performanceMonitor.getMetricsHistory();
    res.json({
      success: true,
      count: history.length,
      history: history.map((m) => ({
        timestamp: new Date(m.timestamp).toISOString(),
        heapUsedMB: (m.memory.heapUsed / 1024 / 1024).toFixed(2),
        requests: m.requestCount,
      })),
    });
  });

  // Get tool execution metrics
  router.get('/metrics/tools', (_req, res) => {
    const toolMetrics = performanceMonitor.getToolMetrics();
    res.json({
      success: true,
      count: toolMetrics.length,
      tools: toolMetrics.map((t) => ({
        name: t.toolName,
        executions: t.executionCount,
        averageTime: `${t.averageExecutionTime.toFixed(2)}ms`,
        errors: t.errorCount,
        errorRate: t.executionCount > 0 ? ((t.errorCount / t.executionCount) * 100).toFixed(2) + '%' : '0%',
      })),
    });
  });

  // Get performance summary
  router.get('/metrics/summary', (_req, res) => {
    res.json({
      success: true,
      summary: performanceMonitor.getSummary(),
    });
  });

  // Health check with detailed status
  router.get('/health/detailed', (_req, res) => {
    const metrics = performanceMonitor.getCurrentMetrics();
    const memoryStatus = metrics
      ? metrics.memory.heapUsed < 512 * 1024 * 1024
        ? 'healthy'
        : metrics.memory.heapUsed < 1024 * 1024 * 1024
          ? 'warning'
          : 'critical'
      : 'unknown';

    res.json({
      success: true,
      status: memoryStatus === 'healthy' ? 'ok' : memoryStatus,
      checks: {
        memory: {
          status: memoryStatus,
          heapUsed: metrics ? `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)} MB` : 'unknown',
        },
        metrics: {
          status: metrics ? 'collecting' : 'not_started',
          dataPoints: performanceMonitor.getMetricsHistory().length,
        },
      },
    });
  });

  return router;
}
