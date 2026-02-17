"""
GUI Control module unit tests.
测试 GUI 控制模块的核心功能和边界场景。
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gui_control import GuiController


class TestGuiController(unittest.TestCase):
    """测试 GuiController 类"""

    def setUp(self):
        """每个测试前初始化"""
        self.gui = GuiController()

    @patch('gui_control.Desktop')
    def test_list_windows_returns_list(self, mock_desktop):
        """测试 list_windows 返回窗口列表"""
        # Mock window
        mock_win = Mock()
        mock_win.is_visible.return_value = True
        mock_win.window_text.return_value = "Test Window"
        mock_win.class_name.return_value = "TestClass"
        mock_rect = Mock()
        mock_rect.left = 0
        mock_rect.top = 0
        mock_rect.right = 800
        mock_rect.bottom = 600
        mock_win.rectangle.return_value = mock_rect

        # Mock desktop
        mock_desktop_instance = Mock()
        mock_desktop_instance.windows.return_value = [mock_win]
        mock_desktop.return_value = mock_desktop_instance

        # Execute
        windows = self.gui.list_windows()

        # Verify
        self.assertIsInstance(windows, list)
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0]['title'], "Test Window")
        self.assertEqual(windows[0]['class_name'], "TestClass")
        self.assertIn('rectangle', windows[0])

    @patch('gui_control.Desktop')
    def test_list_windows_skips_invisible_windows(self, mock_desktop):
        """测试 list_windows 跳过不可见窗口"""
        # Mock visible and invisible windows
        mock_visible = Mock()
        mock_visible.is_visible.return_value = True
        mock_visible.window_text.return_value = "Visible"
        mock_rect = Mock()
        mock_rect.left = 0
        mock_rect.top = 0
        mock_rect.right = 800
        mock_rect.bottom = 600
        mock_visible.rectangle.return_value = mock_rect
        mock_visible.class_name.return_value = "TestClass"

        mock_invisible = Mock()
        mock_invisible.is_visible.return_value = False

        mock_desktop_instance = Mock()
        mock_desktop_instance.windows.return_value = [mock_visible, mock_invisible]
        mock_desktop.return_value = mock_desktop_instance

        # Execute
        windows = self.gui.list_windows()

        # Verify
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0]['title'], "Visible")

    @patch('gui_control.Desktop')
    def test_list_windows_handles_exceptions_gracefully(self, mock_desktop):
        """测试 list_windows 优雅处理异常"""
        # Mock window that raises exception
        mock_win = Mock()
        mock_win.is_visible.side_effect = Exception("Access denied")

        mock_desktop_instance = Mock()
        mock_desktop_instance.windows.return_value = [mock_win]
        mock_desktop.return_value = mock_desktop_instance

        # Execute - should not raise exception
        windows = self.gui.list_windows()

        # Verify - empty list, no crash
        self.assertEqual(len(windows), 0)

    @patch('gui_control.Application')
    def test_get_controls_returns_controls_list(self, mock_app):
        """测试 get_controls 返回控件列表"""
        # Mock control
        mock_ctrl = Mock()
        mock_ctrl.window_text.return_value = "Button1"
        mock_ctrl.element_info.control_type = "Button"
        mock_ctrl.element_info.class_name = "ButtonClass"
        mock_rect = Mock()
        mock_rect.left = 10
        mock_rect.top = 10
        mock_rect.right = 100
        mock_rect.bottom = 40
        mock_ctrl.rectangle.return_value = mock_rect

        # Mock window
        mock_window = Mock()
        mock_window.descendants.return_value = [mock_ctrl]

        # Mock app
        mock_app_instance = Mock()
        mock_app_instance.window.return_value = mock_window
        mock_app.return_value.connect.return_value = mock_app_instance

        # Execute
        controls = self.gui.get_controls("Test Window")

        # Verify
        self.assertIsInstance(controls, list)
        self.assertEqual(len(controls), 1)
        self.assertEqual(controls[0]['name'], "Button1")
        self.assertEqual(controls[0]['control_type'], "Button")

    @patch('gui_control.Application')
    def test_get_controls_window_not_found_raises_exception(self, mock_app):
        """测试 get_controls 在窗口不存在时抛出异常"""
        from pywinauto.findwindows import ElementNotFoundError

        # Mock app to raise ElementNotFoundError
        mock_app.return_value.connect.side_effect = ElementNotFoundError("Window not found")

        # Execute and verify
        with self.assertRaises(Exception) as context:
            self.gui.get_controls("Nonexistent Window")

        self.assertIn("Window not found", str(context.exception))

    @patch('gui_control.pyautogui')
    def test_click_with_coordinates(self, mock_pyautogui):
        """测试使用坐标点击"""
        # Execute
        result = self.gui.click(x=100, y=200)

        # Verify
        mock_pyautogui.click.assert_called_once_with(100, 200)
        self.assertEqual(result['action'], 'click')
        self.assertEqual(result['method'], 'coordinates')
        self.assertEqual(result['position'], [100, 200])

    @patch('gui_control.Application')
    @patch('gui_control.pyautogui')
    def test_click_with_target_control(self, mock_pyautogui, mock_app):
        """测试使用控件名称点击"""
        # Mock control
        mock_ctrl = Mock()
        mock_rect = Mock()
        mock_rect.left = 10
        mock_rect.top = 10
        mock_rect.right = 100
        mock_rect.bottom = 40
        mock_ctrl.rectangle.return_value = mock_rect

        # Mock window
        mock_window = Mock()
        mock_window.child_window.return_value = mock_ctrl

        # Mock app
        mock_app_instance = Mock()
        mock_app_instance.window.return_value = mock_window
        mock_app.return_value.connect.return_value = mock_app_instance

        # Execute
        result = self.gui.click(target="Button1", window_title="Test Window")

        # Verify
        mock_pyautogui.click.assert_called_once()
        self.assertEqual(result['action'], 'click')
        self.assertEqual(result['method'], 'control')

    def test_click_requires_x_and_y_or_target(self):
        """测试 click 需要坐标或目标参数"""
        with self.assertRaises(Exception) as context:
            self.gui.click()

        self.assertIn("coordinates or target", str(context.exception).lower())

    @patch('gui_control.pyautogui')
    def test_type_text_sends_text(self, mock_pyautogui):
        """测试 type_text 发送文本"""
        # Execute
        result = self.gui.type_text("Hello World")

        # Verify
        mock_pyautogui.write.assert_called_once_with("Hello World", interval=0.05)
        self.assertEqual(result['action'], 'type_text')
        self.assertEqual(result['text'], "Hello World")

    @patch('gui_control.pyautogui')
    def test_type_text_handles_unicode(self, mock_pyautogui):
        """测试 type_text 处理 Unicode 字符"""
        # Execute
        result = self.gui.type_text("你好世界")

        # Verify
        mock_pyautogui.write.assert_called_once_with("你好世界", interval=0.05)
        self.assertEqual(result['text'], "你好世界")

    @patch('gui_control.pyautogui')
    def test_hotkey_single_key(self, mock_pyautogui):
        """测试 hotkey 单个按键"""
        # Execute
        result = self.gui.hotkey("a")

        # Verify
        mock_pyautogui.hotkey.assert_called_once_with("a")
        self.assertEqual(result['action'], 'hotkey')
        self.assertEqual(result['keys'], ["a"])

    @patch('gui_control.pyautogui')
    def test_hotkey_multiple_keys(self, mock_pyautogui):
        """测试 hotkey 组合键"""
        # Execute
        result = self.gui.hotkey("ctrl", "s")

        # Verify
        mock_pyautogui.hotkey.assert_called_once_with("ctrl", "s")
        self.assertEqual(result['keys'], ["ctrl", "s"])

    @patch('gui_control.pyautogui')
    def test_scroll_default_direction(self, mock_pyautogui):
        """测试 scroll 默认向下滚动"""
        # Execute
        result = self.gui.scroll()

        # Verify
        mock_pyautogui.scroll.assert_called_once_with(-3)
        self.assertEqual(result['action'], 'scroll')

    @patch('gui_control.pyautogui')
    def test_scroll_custom_clicks(self, mock_pyautogui):
        """测试 scroll 自定义滚动量"""
        # Execute
        result = self.gui.scroll(clicks=5, direction='up')

        # Verify
        mock_pyautogui.scroll.assert_called_once_with(5)
        self.assertEqual(result['clicks'], 5)
        self.assertEqual(result['direction'], 'up')

    @patch('gui_control.pyautogui')
    def test_right_click(self, mock_pyautogui):
        """测试右键点击"""
        # Execute
        result = self.gui.right_click(100, 200)

        # Verify
        mock_pyautogui.rightClick.assert_called_once_with(100, 200)
        self.assertEqual(result['action'], 'right_click')
        self.assertEqual(result['position'], [100, 200])

    @patch('gui_control.pyautogui')
    def test_double_click(self, mock_pyautogui):
        """测试双击"""
        # Execute
        result = self.gui.double_click(100, 200)

        # Verify
        mock_pyautogui.doubleClick.assert_called_once_with(100, 200)
        self.assertEqual(result['action'], 'double_click')

    @patch('gui_control.pyautogui')
    def test_drag_from_to(self, mock_pyautogui):
        """测试拖拽操作"""
        # Execute
        result = self.gui.drag(from_x=100, from_y=100, to_x=200, to_y=200)

        # Verify
        mock_pyautogui.moveTo.assert_called_once_with(100, 100)
        mock_pyautogui.drag.assert_called_once_with(100, 100, duration=0.5)
        self.assertEqual(result['action'], 'drag')

    @patch('gui_control.pyautogui')
    def test_hover(self, mock_pyautogui):
        """测试悬停操作"""
        # Execute
        result = self.gui.hover(150, 250)

        # Verify
        mock_pyautogui.moveTo.assert_called_once_with(150, 250)
        self.assertEqual(result['action'], 'hover')
        self.assertEqual(result['position'], [150, 250])

    @patch('gui_control.pyautogui')
    @patch('os.makedirs')
    @patch('os.path.exists')
    def test_screenshot_full_screen(self, mock_exists, mock_makedirs, mock_pyautogui):
        """测试全屏截图"""
        mock_exists.return_value = True
        mock_img = Mock()
        mock_img.size = (1920, 1080)
        mock_pyautogui.screenshot.return_value = mock_img

        # Execute
        result = self.gui.screenshot()

        # Verify
        mock_pyautogui.screenshot.assert_called_once()
        self.assertEqual(result['action'], 'screenshot')
        self.assertIn('path', result)
        self.assertEqual(result['size'], [1920, 1080])

    def test_screenshot_dir_initialization(self):
        """测试截图目录初始化"""
        self.assertEqual(self.gui.screenshot_dir, './screenshots')


class TestGuiControllerEdgeCases(unittest.TestCase):
    """测试 GuiController 边界场景"""

    def setUp(self):
        self.gui = GuiController()

    @patch('gui_control.pyautogui')
    def test_click_negative_coordinates(self, mock_pyautogui):
        """测试负坐标点击（边界场景）"""
        # Execute - should work for multi-monitor setups
        result = self.gui.click(x=-100, y=50)

        # Verify
        mock_pyautogui.click.assert_called_once_with(-100, 50)

    @patch('gui_control.pyautogui')
    def test_type_text_empty_string(self, mock_pyautogui):
        """测试输入空字符串"""
        # Execute
        result = self.gui.type_text("")

        # Verify
        mock_pyautogui.write.assert_called_once_with("", interval=0.05)
        self.assertEqual(result['text'], "")

    @patch('gui_control.pyautogui')
    def test_hotkey_empty_keys(self, mock_pyautogui):
        """测试空按键组合"""
        # Execute
        result = self.gui.hotkey()

        # Verify - should still call hotkey with no args
        mock_pyautogui.hotkey.assert_called_once_with()

    @patch('gui_control.pyautogui')
    def test_scroll_zero_clicks(self, mock_pyautogui):
        """测试零滚动量"""
        # Execute
        result = self.gui.scroll(clicks=0)

        # Verify
        mock_pyautogui.scroll.assert_called_once_with(0)
        self.assertEqual(result['clicks'], 0)


if __name__ == '__main__':
    unittest.main()
