"""
Main API routes unit tests.
测试 Flask API 路由的核心功能和错误处理。
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import sys
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Mock dependencies before importing main
sys.modules['gui_control'] = MagicMock()
sys.modules['ocr_service'] = MagicMock()
sys.modules['browser_control'] = MagicMock()

from main import app, _error_response, _ok


class TestHealthEndpoint(unittest.TestCase):
    """测试 /health 端点"""

    def setUp(self):
        """设置测试客户端"""
        self.client = app.test_client()
        self.client.testing = True

    @patch('main.ocr')
    @patch('main.browser')
    def test_health_all_ok(self, mock_browser, mock_ocr):
        """测试所有服务正常时的健康检查"""
        # Mock healthy state
        mock_ocr.health_probe.return_value = {'state': 'ok', 'detail': {}}
        mock_browser.health_probe.return_value = {'state': 'ok', 'detail': {}}

        # Execute
        response = self.client.get('/health')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['status'], 'ok')
        self.assertEqual(data['service'], 'python-automation')
        self.assertIn('version', data)
        self.assertIn('uptimeSec', data)
        self.assertGreaterEqual(data['uptimeSec'], 0)
        self.assertEqual(data['deps']['gui'], 'ok')
        self.assertEqual(data['deps']['ocr'], 'ok')
        self.assertEqual(data['deps']['browser'], 'ok')

    @patch('main.ocr')
    @patch('main.browser')
    def test_health_degraded_ocr(self, mock_browser, mock_ocr):
        """测试 OCR 服务降级时的健康检查"""
        # Mock degraded OCR
        mock_ocr.health_probe.return_value = {'state': 'degraded', 'detail': {}}
        mock_browser.health_probe.return_value = {'state': 'ok', 'detail': {}}

        # Execute
        response = self.client.get('/health')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['status'], 'degraded')
        self.assertEqual(data['deps']['ocr'], 'degraded')


class TestWindowsEndpoints(unittest.TestCase):
    """测试窗口相关端点"""

    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    @patch('main.gui')
    def test_list_windows_success(self, mock_gui):
        """测试列出窗口成功"""
        # Mock response
        mock_gui.list_windows.return_value = [
            {'title': 'Window 1', 'class_name': 'Class1'},
            {'title': 'Window 2', 'class_name': 'Class2'}
        ]

        # Execute
        response = self.client.get('/api/windows')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])
        self.assertEqual(len(data['windows']), 2)
        self.assertEqual(data['windows'][0]['title'], 'Window 1')

    @patch('main.gui')
    def test_list_windows_exception_handling(self, mock_gui):
        """测试列出窗口异常处理"""
        # Mock exception
        mock_gui.list_windows.side_effect = Exception("Access denied")

        # Execute
        response = self.client.get('/api/windows')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 500)
        self.assertFalse(data['success'])
        self.assertIn('errorCode', data)
        self.assertIn('message', data)

    @patch('main.gui')
    def test_get_controls_success(self, mock_gui):
        """测试获取控件成功"""
        # Mock response
        mock_gui.get_controls.return_value = [
            {'name': 'Button1', 'control_type': 'Button'}
        ]

        # Execute
        response = self.client.post('/api/window/controls',
                                     data=json.dumps({'title': 'Test Window'}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])
        self.assertEqual(len(data['controls']), 1)

    def test_get_controls_missing_title(self):
        """测试缺少 title 参数"""
        # Execute
        response = self.client.post('/api/window/controls',
                                     data=json.dumps({}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data['success'])
        self.assertEqual(data['errorCode'], 'INVALID_ARGUMENT')
        self.assertIn('title is required', data['message'])


class TestClickEndpoints(unittest.TestCase):
    """测试点击相关端点"""

    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    @patch('main.gui')
    def test_click_with_coordinates(self, mock_gui):
        """测试使用坐标点击"""
        # Mock response
        mock_gui.click.return_value = {'action': 'click', 'method': 'coordinates'}

        # Execute
        response = self.client.post('/api/click',
                                     data=json.dumps({'x': 100, 'y': 200}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])
        mock_gui.click.assert_called_once_with(x=100, y=200, target=None, window_title=None)

    @patch('main.gui')
    def test_click_with_target(self, mock_gui):
        """测试使用控件名称点击"""
        # Mock response
        mock_gui.click.return_value = {'action': 'click', 'method': 'control'}

        # Execute
        response = self.client.post('/api/click',
                                     data=json.dumps({'target': 'Button1', 'window_title': 'Test'}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])

    def test_click_missing_params(self):
        """测试缺少必要参数"""
        # Execute
        response = self.client.post('/api/click',
                                     data=json.dumps({}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data['success'])
        self.assertEqual(data['errorCode'], 'INVALID_ARGUMENT')

    @patch('main.gui')
    def test_right_click(self, mock_gui):
        """测试右键点击"""
        mock_gui.right_click.return_value = {'action': 'right_click'}

        # Execute
        response = self.client.post('/api/right_click',
                                     data=json.dumps({'x': 100, 'y': 200}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])
        mock_gui.right_click.assert_called_once_with(100, 200)

    @patch('main.gui')
    def test_double_click(self, mock_gui):
        """测试双击"""
        mock_gui.double_click.return_value = {'action': 'double_click'}

        # Execute
        response = self.client.post('/api/double_click',
                                     data=json.dumps({'x': 150, 'y': 250}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])


class TestTextInputEndpoints(unittest.TestCase):
    """测试文本输入相关端点"""

    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    @patch('main.gui')
    def test_type_text_success(self, mock_gui):
        """测试输入文本成功"""
        mock_gui.type_text.return_value = {'action': 'type_text', 'text': 'Hello'}

        # Execute
        response = self.client.post('/api/type_text',
                                     data=json.dumps({'text': 'Hello'}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])
        mock_gui.type_text.assert_called_once_with('Hello')

    def test_type_text_missing_text(self):
        """测试缺少 text 参数"""
        # Execute
        response = self.client.post('/api/type_text',
                                     data=json.dumps({}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data['success'])
        self.assertEqual(data['errorCode'], 'INVALID_ARGUMENT')

    @patch('main.gui')
    def test_hotkey_success(self, mock_gui):
        """测试快捷键成功"""
        mock_gui.hotkey.return_value = {'action': 'hotkey', 'keys': ['ctrl', 's']}

        # Execute
        response = self.client.post('/api/hotkey',
                                     data=json.dumps({'keys': ['ctrl', 's']}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])
        mock_gui.hotkey.assert_called_once_with('ctrl', 's')

    def test_hotkey_missing_keys(self):
        """测试缺少 keys 参数"""
        # Execute
        response = self.client.post('/api/hotkey',
                                     data=json.dumps({}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data['success'])


class TestOCREndpoints(unittest.TestCase):
    """测试 OCR 相关端点"""

    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    @patch('main.ocr')
    def test_ocr_recognize_success(self, mock_ocr):
        """测试 OCR 识别成功"""
        mock_ocr.recognize.return_value = {
            'texts': ['Hello', 'World'],
            'boxes': [[0, 0, 100, 50], [100, 0, 200, 50]]
        }

        # Execute
        response = self.client.post('/api/ocr/recognize',
                                     data=json.dumps({'image_path': 'test.png'}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])
        self.assertIn('result', data)

    def test_ocr_recognize_missing_path(self):
        """测试缺少图片路径"""
        # Execute
        response = self.client.post('/api/ocr/recognize',
                                     data=json.dumps({}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data['success'])


class TestBrowserEndpoints(unittest.TestCase):
    """测试浏览器相关端点"""

    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    @patch('main.browser')
    def test_browser_launch(self, mock_browser):
        """测试启动浏览器"""
        mock_browser.launch.return_value = {'action': 'browser_launch', 'headless': False}

        # Execute
        response = self.client.post('/api/browser/launch',
                                     data=json.dumps({'headless': False}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])

    @patch('main.browser')
    def test_browser_navigate(self, mock_browser):
        """测试浏览器导航"""
        mock_browser.navigate.return_value = {
            'action': 'browser_navigate',
            'url': 'https://example.com'
        }

        # Execute
        response = self.client.post('/api/browser/navigate',
                                     data=json.dumps({'url': 'https://example.com'}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])

    def test_browser_navigate_missing_url(self):
        """测试缺少 URL 参数"""
        # Execute
        response = self.client.post('/api/browser/navigate',
                                     data=json.dumps({}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 400)
        self.assertFalse(data['success'])
        self.assertEqual(data['errorCode'], 'INVALID_ARGUMENT')

    @patch('main.browser')
    def test_browser_close(self, mock_browser):
        """测试关闭浏览器"""
        mock_browser.close.return_value = {'action': 'browser_close', 'closed': True}

        # Execute
        response = self.client.post('/api/browser/close',
                                     data=json.dumps({}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data['success'])


class TestHelperFunctions(unittest.TestCase):
    """测试辅助函数"""

    def test_error_response_structure(self):
        """测试错误响应结构"""
        response, status_code = _error_response("TEST_ERROR", "Test message", 400)
        data = response.get_json()

        # Verify
        self.assertEqual(status_code, 400)
        self.assertFalse(data['success'])
        self.assertEqual(data['errorCode'], "TEST_ERROR")
        self.assertEqual(data['message'], "Test message")
        self.assertIn('requestId', data)

    def test_error_response_with_details(self):
        """测试带详情的错误响应"""
        response, status_code = _error_response(
            "TEST_ERROR",
            "Test message",
            400,
            {"field": "username"}
        )
        data = response.get_json()

        # Verify
        self.assertEqual(data['details']['field'], "username")

    def test_ok_response_structure(self):
        """测试成功响应结构"""
        response = _ok(result="test", count=5)
        data = response.get_json()

        # Verify
        self.assertTrue(data['success'])
        self.assertEqual(data['result'], "test")
        self.assertEqual(data['count'], 5)


class TestEdgeCases(unittest.TestCase):
    """测试边界场景"""

    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    def test_invalid_json_body(self):
        """测试无效 JSON 请求体"""
        # Execute - send invalid JSON
        response = self.client.post('/api/click',
                                     data='invalid json',
                                     content_type='application/json')

        # Verify - should handle gracefully
        self.assertIn(response.status_code, [400, 500])

    def test_missing_content_type(self):
        """测试缺少 Content-Type"""
        # Execute
        response = self.client.post('/api/click',
                                     data=json.dumps({'x': 100, 'y': 200}))

        # Verify - should still work or return clear error
        self.assertIn(response.status_code, [200, 400, 415])

    @patch('main.gui')
    def test_large_coordinate_values(self, mock_gui):
        """测试大坐标值"""
        mock_gui.click.return_value = {'action': 'click'}

        # Execute
        response = self.client.post('/api/click',
                                     data=json.dumps({'x': 999999, 'y': 999999}),
                                     content_type='application/json')
        data = json.loads(response.data)

        # Verify - should handle or reject appropriately
        self.assertIn(response.status_code, [200, 400])


if __name__ == '__main__':
    unittest.main()
