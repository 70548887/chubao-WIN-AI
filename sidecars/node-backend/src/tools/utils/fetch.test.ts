import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, fetchWithTimeout } from './fetch.js';

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return response on success', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry('http://test.com');
    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockResponse);

    const promise = fetchWithRetry('http://test.com', {}, 3);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    const promise = fetchWithRetry('http://test.com', {}, 2);

    // Advance timers and handle the rejection together
    const [, result] = await Promise.all([
      vi.advanceTimersByTimeAsync(2000),
      promise.catch(err => err)
    ]);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Network error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should add Content-Type header by default', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await fetchWithRetry('http://test.com');

    expect(fetch).toHaveBeenCalledWith(
      'http://test.com',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('should merge custom headers', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await fetchWithRetry('http://test.com', {
      headers: { Authorization: 'Bearer token' },
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://test.com',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
      }),
    );
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return response before timeout', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithTimeout('http://test.com');
    expect(result).toBe(mockResponse);
  });

  it('should pass signal to fetch', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await fetchWithTimeout('http://test.com');

    expect(fetch).toHaveBeenCalledWith(
      'http://test.com',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

describe('fetch edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should handle zero retries', async () => {
    // When maxRetries is 0, the function should not make any requests
    await expect(fetchWithRetry('http://test.com', {}, 0)).rejects.toThrow('Request failed after retries');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should handle single retry', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockResponse);

    const promise = fetchWithRetry('http://test.com', {}, 2);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should handle empty options', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await fetchWithRetry('http://test.com');

    expect(fetch).toHaveBeenCalledWith(
      'http://test.com',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('should handle very long URL', async () => {
    const longUrl = 'http://test.com/' + 'a'.repeat(2000);
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry(longUrl);
    expect(result).toBe(mockResponse);
  });

  it('should handle special characters in URL', async () => {
    const specialUrl = 'http://test.com/path?query=test&special=%20%26%3D';
    const mockResponse = new Response('{}', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry(specialUrl);
    expect(result).toBe(mockResponse);
  });

  it('should handle non-JSON response', async () => {
    const mockResponse = new Response('plain text', { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry('http://test.com');
    expect(result).toBe(mockResponse);
  });

  it('should handle error response status', async () => {
    const mockResponse = new Response('{}', { status: 500 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry('http://test.com');
    expect(result.status).toBe(500);
  });
});
