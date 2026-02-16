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
