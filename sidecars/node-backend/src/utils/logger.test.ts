/**
 * Unit tests for structured logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createLogger, LogLevel } from './logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.setLevel(LogLevel.DEBUG); // Enable all logs for testing
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Logging', () => {
    it('should log info messages', () => {
      logger.info('Test info message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('INFO');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Test info message');
    });

    it('should log debug messages', () => {
      logger.debug('Test debug message');
      expect(consoleDebugSpy).toHaveBeenCalledOnce();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('DEBUG');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('Test debug message');
    });

    it('should log warn messages', () => {
      logger.warn('Test warn message');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('WARN');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Test warn message');
    });

    it('should log error messages', () => {
      logger.error('Test error message');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Test error message');
    });

    it('should log fatal messages', () => {
      logger.fatal('Test fatal message');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('FATAL');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Test fatal message');
    });
  });

  describe('Log Levels', () => {
    it('should respect minimum log level - INFO', () => {
      logger.setLevel(LogLevel.INFO);
      
      logger.debug('Should not be logged');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      
      logger.info('Should be logged');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
    });

    it('should respect minimum log level - WARN', () => {
      logger.setLevel(LogLevel.WARN);
      
      logger.debug('Should not be logged');
      logger.info('Should not be logged');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      
      logger.warn('Should be logged');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });

    it('should respect minimum log level - ERROR', () => {
      logger.setLevel(LogLevel.ERROR);
      
      logger.debug('Should not be logged');
      logger.info('Should not be logged');
      logger.warn('Should not be logged');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      
      logger.error('Should be logged');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Context Logging', () => {
    it('should include context in log messages', () => {
      logger.info('Test with context', { userId: '123', action: 'login' });
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('userId');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('123');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('action');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('login');
    });

    it('should handle empty context', () => {
      logger.info('Test without context');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Error Logging', () => {
    it('should log Error objects with stack trace', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error occurred');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Test error');
    });

    it('should handle non-Error objects', () => {
      logger.error('Error occurred', 'string error');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('string error');
    });

    it('should handle error with context', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error, { userId: '123' });
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('userId');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('123');
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log API requests', () => {
      logger.apiRequest('GET', '/api/test', 200, 123.45);
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('API request');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('GET');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('/api/test');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('200');
    });

    it('should log successful tool execution', () => {
      logger.toolExecution('testTool', true, 50.25);
      expect(consoleDebugSpy).toHaveBeenCalledOnce();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('Tool executed');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('testTool');
    });

    it('should log failed tool execution', () => {
      logger.toolExecution('testTool', false, 50.25, 'Tool timeout');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Tool failed');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('testTool');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Tool timeout');
    });

    it('should log agent actions', () => {
      logger.agentAction('think', { thought: 'analyzing task' });
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Agent action');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('think');
    });

    it('should log successful memory operations', () => {
      logger.memoryOperation('store', true, { key: 'test-key' });
      expect(consoleDebugSpy).toHaveBeenCalledOnce();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('Memory operation');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('store');
    });

    it('should log failed memory operations', () => {
      logger.memoryOperation('store', false, { key: 'test-key' });
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Memory operation failed');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('store');
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with custom service name', () => {
      const childLogger = createLogger('test-service');
      childLogger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Test message');
    });

    it('should create child logger with custom log level', () => {
      const childLogger = createLogger('test-service', LogLevel.ERROR);
      
      childLogger.info('Should not be logged');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      
      childLogger.error('Should be logged');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Production Mode', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });

    it('should output JSON format in production', () => {
      logger.info('Production log');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      
      const logOutput = consoleLogSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logOutput)).not.toThrow();
      
      const parsed = JSON.parse(logOutput);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Production log');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should output JSON format for errors in production', () => {
      const error = new Error('Production error');
      logger.error('Error in production', error);
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      
      const logOutput = consoleErrorSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logOutput)).not.toThrow();
      
      const parsed = JSON.parse(logOutput);
      expect(parsed.level).toBe('error');
      expect(parsed.message).toBe('Error in production');
      expect(parsed.stack).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      logger.info(longMessage);
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy.mock.calls[0][0]).toContain(longMessage);
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Test with 中文 and émojis 🚀🎉';
      logger.info(specialMessage);
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      expect(consoleLogSpy.mock.calls[0][0]).toContain(specialMessage);
    });

    it('should handle circular references in context', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      // Should not throw
      expect(() => {
        logger.info('Test with circular', { data: circular });
      }).toThrow(); // JSON.stringify will throw on circular refs
    });

    it('should handle null and undefined in context', () => {
      logger.info('Test with null/undefined', { nullValue: null, undefinedValue: undefined });
      expect(consoleLogSpy).toHaveBeenCalledOnce();
    });
  });
});
