#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hello World 技能测试脚本
"""

import unittest
from hello import hello_world, get_greeting, time_based_greeting

class TestHelloWorld(unittest.TestCase):
    
    def test_hello_world_default(self):
        """测试默认问候"""
        result = hello_world()
        self.assertIn("你好，世界", result)
        self.assertIn("Kiro AI助手", result)
    
    def test_hello_world_custom_name(self):
        """测试自定义名称问候"""
        result = hello_world("张三")
        self.assertIn("你好，张三", result)
    
    def test_get_greeting_chinese(self):
        """测试中文问候"""
        result = get_greeting("zh")
        self.assertEqual(result, "你好，世界！")
    
    def test_get_greeting_english(self):
        """测试英文问候"""
        result = get_greeting("en")
        self.assertEqual(result, "Hello, World!")
    
    def test_get_greeting_unknown_language(self):
        """测试未知语言默认返回中文"""
        result = get_greeting("unknown")
        self.assertEqual(result, "你好，世界！")
    
    def test_time_based_greeting(self):
        """测试基于时间的问候"""
        result = time_based_greeting()
        self.assertIsInstance(result, str)
        self.assertTrue(len(result) > 0)

if __name__ == "__main__":
    unittest.main()
