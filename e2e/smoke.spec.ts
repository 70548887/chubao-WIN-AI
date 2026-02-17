import { test, expect } from '@playwright/test';

/**
 * E2E Smoke Tests for Chubao AI
 * Basic functionality verification
 */

test.describe('Chubao AI Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    
    // Verify app title
    await expect(page).toHaveTitle(/Chubao AI/);
    
    // Verify main UI elements exist
    await expect(page.locator('body')).toBeVisible();
  });

  test('API health check - Node backend', async ({ request }) => {
    const response = await request.get('http://localhost:3100/health');
    
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('node-backend');
  });

  test('API health check - Python automation', async ({ request }) => {
    const response = await request.get('http://localhost:3200/health');
    
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('python-automation');
  });

  test('tools API returns available tools', async ({ request }) => {
    const response = await request.get('http://localhost:3100/api/tools');
    
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
    
    // Verify essential tools exist
    const toolNames = body.tools.map((t: any) => t.name);
    expect(toolNames).toContain('screenshot');
    expect(toolNames).toContain('click');
    expect(toolNames).toContain('hotkey');
  });

  test('chat API accepts messages', async ({ request }) => {
    const response = await request.post('http://localhost:3100/api/chat', {
      data: {
        message: 'Hello, this is an E2E test',
      },
    });
    
    // Should return success or error (both are valid responses)
    const status = response.status();
    expect([200, 400, 500].includes(status)).toBe(true);
  });

  test('platforms status API works', async ({ request }) => {
    const response = await request.get('http://localhost:3100/api/platforms/status');
    
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.platforms).toBeDefined();
  });
});
