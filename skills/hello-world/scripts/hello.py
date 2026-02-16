#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hello World 技能脚本
简单的问候功能实现
"""

import datetime

def hello_world(name="世界"):
    """
    返回一个友好的问候消息
    
    Args:
        name (str): 要问候的对象名称，默认为"世界"
    
    Returns:
        str: 问候消息
    """
    return f"你好，{name}！欢迎使用Kiro AI助手！"

def get_greeting(language="zh"):
    """
    根据语言返回不同的问候语
    
    Args:
        language (str): 语言代码 (zh/en/ja/ko)
    
    Returns:
        str: 对应语言的问候语
    """
    greetings = {
        "zh": "你好，世界！",
        "en": "Hello, World!",
        "ja": "こんにちは、世界！",
        "ko": "안녕하세요, 세계!"
    }
    return greetings.get(language, greetings["zh"])

def time_based_greeting(language="zh"):
    """
    根据当前时间返回合适的问候语
    
    Args:
        language (str): 语言代码
    
    Returns:
        str: 基于时间的问候语
    """
    current_hour = datetime.datetime.now().hour
    
    if language == "zh":
        if 5 <= current_hour < 12:
            return "早上好！"
        elif 12 <= current_hour < 18:
            return "下午好！"
        elif 18 <= current_hour < 22:
            return "晚上好！"
        else:
            return "夜深了，注意休息！"
    else:
        if 5 <= current_hour < 12:
            return "Good morning!"
        elif 12 <= current_hour < 18:
            return "Good afternoon!"
        elif 18 <= current_hour < 22:
            return "Good evening!"
        else:
            return "Good night!"

if __name__ == "__main__":
    # 测试函数
    print(hello_world())
    print(hello_world("Kiro用户"))
    print(get_greeting("en"))
    print(time_based_greeting())
