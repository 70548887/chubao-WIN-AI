"""
Browser Control module unit tests.
测试 Playwright 浏览器控制模块的核心功能和边界场景。
"""

import unittest
from unittest.mock import Mock, patch, MagicMock, PropertyMock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from browser_control import BrowserController


class TestBrowserController(unittest.TestCase):
    """测试 BrowserController 类"""

    def setUp(self):
        """每个测试前初始化"""
        self.browser = BrowserController()

    def test_initialization(self):
        """测试初始化状态"""
        self.assertEqual(self.browser.screenshot_dir, './screenshots')
        self.assertIsNone(self.browser._playwright)
        self.assertIsNone(self.browser._browser)
        self.assertIsNone(self.browser._page)

    def test_health_probe_when_playwright_unavailable(self):
        """测试 Playwright 不可用时的健康探针"""
        # Simulate import error
        self.browser._sync_playwright = None
        self.browser._import_error = Exception("Playwright not installed")

        # Execute
        probe = self.browser.health_probe()

        # Verify
        self.assertEqual(probe['state'], 'degraded')
        self.assertFalse(probe['detail']['available'])
        self.assertIn('playwright unavailable', probe['detail']['reason'])

    def test_health_probe_when_playwright_available(self):
        """测试 Playwright 可用时的健康探针"""
        # Mock sync_playwright
        self.browser._sync_playwright = Mock()

        # Execute
        probe = self.browser.health_probe()

        # Verify
        self.assertEqual(probe['state'], 'ok')
        self.assertTrue(probe['detail']['available'])
        self.assertFalse(probe['detail']['launched'])

    def test_health_probe_when_browser_launched(self):
        """测试浏览器已启动时的健康探针"""
        self.browser._sync_playwright = Mock()
        self.browser._browser = Mock()
        mock_page = Mock()
        mock_page.url = "https://example.com"
        self.browser._page = mock_page

        # Execute
        probe = self.browser.health_probe()

        # Verify
        self.assertEqual(probe['state'], 'ok')
        self.assertTrue(probe['detail']['launched'])
        self.assertEqual(probe['detail']['url'], "https://example.com")

    @patch('browser_control.BrowserController._ensure_available')
    def test_launch_with_default_params(self, mock_ensure):
        """测试使用默认参数启动浏览器"""
        # Mock playwright
        mock_playwright = Mock()
        mock_browser = Mock()
        mock_context = Mock()
        mock_page = Mock()

        mock_chromium = Mock()
        mock_chromium.launch.return_value = mock_browser
        mock_playwright.chromium = mock_chromium
        mock_browser.new_context.return_value = mock_context
        mock_context.new_page.return_value = mock_page

        mock_sync_playwright = Mock()
        mock_sync_playwright.return_value.start.return_value = mock_playwright

        self.browser._sync_playwright = mock_sync_playwright

        # Execute
        result = self.browser.launch()

        # Verify
        self.assertEqual(result['action'], 'browser_launch')
        self.assertFalse(result['headless'])
        self.assertEqual(result['viewport'], [1280, 720])
        self.assertIsNotNone(self.browser._browser)
        self.assertIsNotNone(self.browser._page)

    @patch('browser_control.BrowserController._ensure_available')
    def test_launch_headless_mode(self, mock_ensure):
        """测试无头模式启动"""
        mock_playwright = Mock()
        mock_browser = Mock()
        mock_context = Mock()
        mock_page = Mock()

        mock_chromium = Mock()
        mock_chromium.launch.return_value = mock_browser
        mock_playwright.chromium = mock_chromium
        mock_browser.new_context.return_value = mock_context
        mock_context.new_page.return_value = mock_page

        mock_sync_playwright = Mock()
        mock_sync_playwright.return_value.start.return_value = mock_playwright

        self.browser._sync_playwright = mock_sync_playwright

        # Execute
        result = self.browser.launch(headless=True, width=1920, height=1080)

        # Verify
        self.assertTrue(result['headless'])
        self.assertEqual(result['viewport'], [1920, 1080])
        mock_chromium.launch.assert_called_once_with(headless=True)

    @patch('browser_control.BrowserController._ensure_page')
    def test_navigate_with_default_wait(self, mock_ensure_page):
        """测试默认等待策略导航"""
        mock_page = Mock()
        mock_response = Mock()
        mock_response.status = 200
        mock_page.goto.return_value = mock_response
        mock_page.url = "https://example.com"
        mock_page.title.return_value = "Example Domain"
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.navigate("https://example.com")

        # Verify
        self.assertEqual(result['action'], 'browser_navigate')
        self.assertEqual(result['url'], "https://example.com")
        self.assertEqual(result['title'], "Example Domain")
        self.assertEqual(result['status'], 200)
        mock_page.goto.assert_called_once_with(
            "https://example.com",
            wait_until='domcontentloaded',
            timeout=30000
        )

    @patch('browser_control.BrowserController._ensure_page')
    def test_navigate_normalizes_url(self, mock_ensure_page):
        """测试 URL 标准化"""
        mock_page = Mock()
        mock_page.goto.return_value = None
        mock_page.url = "https://example.com"
        mock_page.title.return_value = "Test"
        mock_ensure_page.return_value = mock_page

        # Execute - URL without protocol
        result = self.browser.navigate("example.com")

        # Verify - should add https://
        call_args = mock_page.goto.call_args
        self.assertTrue(call_args[0][0].startswith("https://"))

    @patch('browser_control.BrowserController._ensure_page')
    def test_click_element(self, mock_ensure_page):
        """测试点击元素"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.click("#button")

        # Verify
        self.assertEqual(result['action'], 'browser_click')
        self.assertEqual(result['selector'], "#button")
        self.assertEqual(result['url'], "https://example.com")
        mock_page.click.assert_called_once_with("#button", timeout=10000)

    @patch('browser_control.BrowserController._ensure_page')
    def test_type_text_with_clear(self, mock_ensure_page):
        """测试清空后输入文本"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.type_text("#input", "Hello", clear=True)

        # Verify
        self.assertEqual(result['action'], 'browser_type')
        self.assertEqual(result['text_length'], 5)
        mock_page.fill.assert_called_once_with("#input", "Hello", timeout=10000)
        mock_page.type.assert_not_called()

    @patch('browser_control.BrowserController._ensure_page')
    def test_type_text_without_clear(self, mock_ensure_page):
        """测试追加输入文本"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.type_text("#input", "World", clear=False)

        # Verify
        mock_page.click.assert_called_once_with("#input", timeout=10000)
        mock_page.type.assert_called_once_with("#input", "World", timeout=10000)
        mock_page.fill.assert_not_called()

    @patch('browser_control.BrowserController._ensure_page')
    def test_press_key(self, mock_ensure_page):
        """测试按键"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_keyboard = Mock()
        mock_page.keyboard = mock_keyboard
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.press("Enter")

        # Verify
        self.assertEqual(result['action'], 'browser_press')
        self.assertEqual(result['key'], "Enter")
        mock_keyboard.press.assert_called_once_with("Enter")

    @patch('browser_control.BrowserController._ensure_page')
    def test_scroll_page(self, mock_ensure_page):
        """测试页面滚动"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_mouse = Mock()
        mock_page.mouse = mock_mouse
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.scroll(delta_x=0, delta_y=600)

        # Verify
        self.assertEqual(result['action'], 'browser_scroll')
        self.assertEqual(result['delta_y'], 600)
        mock_mouse.wheel.assert_called_once_with(0, 600)

    @patch('browser_control.BrowserController._ensure_page')
    @patch('os.makedirs')
    def test_screenshot(self, mock_makedirs, mock_ensure_page):
        """测试截图"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_page.viewport_size = {'width': 1280, 'height': 720}
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.screenshot()

        # Verify
        self.assertEqual(result['action'], 'browser_screenshot')
        self.assertIn('path', result)
        self.assertFalse(result['full_page'])
        self.assertEqual(result['size'], [1280, 720])
        mock_page.screenshot.assert_called_once()

    @patch('browser_control.BrowserController._ensure_page')
    def test_read_page_structure(self, mock_ensure_page):
        """测试读取页面结构"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_page.title.return_value = "Example"
        mock_page.content.return_value = "<html><body>Test</body></html>"
        mock_page.evaluate.side_effect = [
            "Test text content",  # innerText
            []  # forms
        ]
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.read_page()

        # Verify
        self.assertEqual(result['action'], 'browser_read_page')
        self.assertEqual(result['url'], "https://example.com")
        self.assertEqual(result['title'], "Example")
        self.assertIn('html', result)
        self.assertIn('text_excerpt', result)
        self.assertEqual(result['form_count'], 0)

    @patch('browser_control.BrowserController._ensure_page')
    def test_get_text_from_selector(self, mock_ensure_page):
        """测试从选择器获取文本"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_locator = Mock()
        mock_locator.inner_text.return_value = "Button Text"
        mock_page.locator.return_value.first = mock_locator
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.get_text(selector="#button")

        # Verify
        self.assertEqual(result['action'], 'browser_get_text')
        self.assertEqual(result['text'], "Button Text")
        self.assertEqual(result['selector'], "#button")
        self.assertFalse(result['truncated'])

    @patch('browser_control.BrowserController._ensure_page')
    def test_get_text_full_page(self, mock_ensure_page):
        """测试获取整个页面文本"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_page.evaluate.return_value = "Full page text"
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.get_text()

        # Verify
        self.assertIsNone(result['selector'])
        self.assertEqual(result['text'], "Full page text")

    @patch('browser_control.BrowserController._ensure_page')
    def test_form_input_text_field(self, mock_ensure_page):
        """测试填写文本表单"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_locator = Mock()
        mock_locator.evaluate.return_value = "input"
        mock_locator.get_attribute.return_value = "text"
        mock_page.locator.return_value.first = mock_locator
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.form_input(
            fields={"#username": "testuser", "#password": "pass123"},
            clear=True
        )

        # Verify
        self.assertEqual(result['action'], 'browser_form_input')
        self.assertEqual(result['applied_count'], 2)
        self.assertFalse(result['submitted'])

    @patch('browser_control.BrowserController._ensure_page')
    def test_form_input_with_submit(self, mock_ensure_page):
        """测试提交表单"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_page.keyboard = Mock()
        mock_locator = Mock()
        mock_locator.evaluate.return_value = "input"
        mock_locator.get_attribute.return_value = "text"
        mock_page.locator.return_value.first = mock_locator
        mock_ensure_page.return_value = mock_page

        # Execute
        result = self.browser.form_input(
            fields={"#email": "test@example.com"},
            submit=True
        )

        # Verify
        self.assertTrue(result['submitted'])
        mock_page.keyboard.press.assert_called_once_with('Enter')

    def test_close_browser(self):
        """测试关闭浏览器"""
        # Mock browser components
        self.browser._context = Mock()
        self.browser._browser = Mock()
        self.browser._playwright = Mock()
        self.browser._page = Mock()

        # Execute
        result = self.browser.close()

        # Verify
        self.assertEqual(result['action'], 'browser_close')
        self.assertTrue(result['closed'])
        self.browser._context.close.assert_called_once()
        self.browser._browser.close.assert_called_once()
        self.browser._playwright.stop.assert_called_once()
        self.assertIsNone(self.browser._context)
        self.assertIsNone(self.browser._browser)
        self.assertIsNone(self.browser._playwright)
        self.assertIsNone(self.browser._page)

    def test_ensure_available_raises_when_unavailable(self):
        """测试 Playwright 不可用时抛出异常"""
        self.browser._sync_playwright = None
        self.browser._import_error = Exception("Import error")

        with self.assertRaises(RuntimeError) as context:
            self.browser._ensure_available()

        self.assertIn("browser dependency unavailable", str(context.exception))

    @patch('browser_control.BrowserController.launch')
    def test_ensure_page_launches_if_no_page(self, mock_launch):
        """测试没有页面时自动启动浏览器"""
        self.browser._sync_playwright = Mock()
        self.browser._page = None
        mock_page = Mock()
        mock_launch.return_value = {'action': 'browser_launch'}
        
        # Setup mock page after launch
        self.browser._page = mock_page

        # Execute
        page = self.browser._ensure_page()

        # Verify
        mock_launch.assert_called_once()
        self.assertEqual(page, mock_page)

    def test_normalize_url_adds_https(self):
        """测试 URL 标准化添加 https"""
        result = self.browser._normalize_url("example.com")
        self.assertEqual(result, "https://example.com")

    def test_normalize_url_keeps_existing_protocol(self):
        """测试保持现有协议"""
        result = self.browser._normalize_url("http://example.com")
        self.assertEqual(result, "http://example.com")

    def test_normalize_url_empty_raises_error(self):
        """测试空 URL 抛出异常"""
        with self.assertRaises(ValueError) as context:
            self.browser._normalize_url("")

        self.assertIn("url is required", str(context.exception))

    def test_normalize_whitespace(self):
        """测试空白字符标准化"""
        result = self.browser._normalize_whitespace("  Hello   World  \n  Test  ")
        self.assertEqual(result, "Hello World Test")

    def test_preview_value_truncates_long_strings(self):
        """测试值预览截断长字符串"""
        long_text = "a" * 100
        result = self.browser._preview_value(long_text, max_chars=80)
        self.assertEqual(len(result), 83)  # 80 + "..."
        self.assertTrue(result.endswith("..."))


class TestBrowserControllerEdgeCases(unittest.TestCase):
    """测试 BrowserController 边界场景"""

    def setUp(self):
        self.browser = BrowserController()

    @patch('browser_control.BrowserController._ensure_available')
    def test_launch_with_minimum_viewport(self, mock_ensure):
        """测试最小视口尺寸"""
        mock_playwright = Mock()
        mock_browser = Mock()
        mock_context = Mock()
        mock_page = Mock()

        mock_chromium = Mock()
        mock_chromium.launch.return_value = mock_browser
        mock_playwright.chromium = mock_chromium
        mock_browser.new_context.return_value = mock_context
        mock_context.new_page.return_value = mock_page

        mock_sync_playwright = Mock()
        mock_sync_playwright.return_value.start.return_value = mock_playwright

        self.browser._sync_playwright = mock_sync_playwright

        # Execute with very small viewport
        result = self.browser.launch(width=100, height=50)

        # Verify - should enforce minimums
        self.assertEqual(result['viewport'], [320, 240])

    @patch('browser_control.BrowserController._ensure_page')
    def test_get_text_truncates_long_text(self, mock_ensure_page):
        """测试长文本截断"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        long_text = "a" * 10000
        mock_page.evaluate.return_value = long_text
        mock_ensure_page.return_value = mock_page

        # Execute with max_chars limit
        result = self.browser.get_text(max_chars=1000)

        # Verify
        self.assertTrue(result['truncated'])
        self.assertEqual(len(result['text']), 1000)
        self.assertEqual(result['text_length'], 10000)

    @patch('browser_control.BrowserController._ensure_page')
    def test_form_input_empty_fields(self, mock_ensure_page):
        """测试空表单字段"""
        mock_page = Mock()
        mock_ensure_page.return_value = mock_page

        # Execute with empty fields
        with self.assertRaises(ValueError) as context:
            self.browser.form_input(fields={})

        self.assertIn("fields is required", str(context.exception))

    @patch('browser_control.BrowserController._ensure_page')
    def test_read_page_html_truncation(self, mock_ensure_page):
        """测试 HTML 内容截断"""
        mock_page = Mock()
        mock_page.url = "https://example.com"
        mock_page.title.return_value = "Test"
        long_html = "<html>" + ("a" * 50000) + "</html>"
        mock_page.content.return_value = long_html
        mock_page.evaluate.side_effect = ["Text", []]
        mock_ensure_page.return_value = mock_page

        # Execute with max_html_chars limit
        result = self.browser.read_page(max_html_chars=10000)

        # Verify
        self.assertTrue(result['html_truncated'])
        self.assertLessEqual(len(result['html']), 10000)
        self.assertGreater(result['html_length'], 10000)


if __name__ == '__main__':
    unittest.main()
