import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hotkeyTool } from './automation.js';

// Mock fetchWithRetry
vi.mock('../utils/fetch.js', () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from '../utils/fetch.js';
const mockFetch = fetchWithRetry as ReturnType<typeof vi.fn>;

describe('hotkeyTool', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute hotkey with keys array', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        result: { action: 'hotkey', keys: ['ctrl', 'c'] },
      }),
    });

    const result = await hotkeyTool.execute?.({ keys: ['ctrl', 'c'] });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/hotkey'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ keys: ['ctrl', 'c'] }),
      })
    );
    expect(result).toEqual({ action: 'hotkey', keys: ['ctrl', 'c'] });
  });

  it('should execute hotkey with multiple keys', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        result: { action: 'hotkey', keys: ['ctrl', 'shift', 'esc'] },
      }),
    });

    const result = await hotkeyTool.execute?.({ keys: ['ctrl', 'shift', 'esc'] });

    expect(result).toEqual({ action: 'hotkey', keys: ['ctrl', 'shift', 'esc'] });
  });

  it('should throw on hotkey failure', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, message: 'Invalid key combination' }),
    });

    await expect(hotkeyTool.execute?.({ keys: ['invalid_key'] })).rejects.toThrow('Invalid key combination');
  });

  it('should throw on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(hotkeyTool.execute?.({ keys: ['ctrl', 'c'] })).rejects.toThrow('Network error');
  });
});
