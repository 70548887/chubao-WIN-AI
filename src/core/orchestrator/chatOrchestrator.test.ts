import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processUserMessage } from './chatOrchestrator';

function createResponse(body: Record<string, unknown>, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('processUserMessage', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes general message to chat endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        success: true,
        response: 'hello from backend',
      }),
    );

    const output = await processUserMessage('hello');
    expect(output).toContain('[1/1] chat-1 (call_chat, required, timeout=');
    expect(output).toContain('hello from backend');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3100/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('routes windows intent to python windows endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          status: 'ok',
          service: 'node-backend',
          version: '0.1.0',
          uptimeSec: 10,
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          status: 'ok',
          service: 'python-automation',
          version: '0.1.0',
          uptimeSec: 12,
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          success: true,
          windows: [
            { title: 'Visual Studio Code', class_name: 'Chrome_WidgetWin_1' },
            { title: '', class_name: 'HiddenWindow' },
          ],
        }),
      );

    const output = await processUserMessage('list windows');
    expect(output).toContain('[1/2] automation-status-precheck-1 (check_services, optional, timeout=');
    expect(output).toContain('[2/2] automation-windows-fetch-2 (fetch_windows, required, timeout=');
    expect(output).toContain('Active windows (1 shown):');
    expect(output).toContain('1. Visual Studio Code [Chrome_WidgetWin_1]');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3200/api/windows',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });
});
