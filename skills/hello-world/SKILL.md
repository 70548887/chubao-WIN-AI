---
name: hello-world
description: 一个简单的Hello World示例技能，用于演示技能系统的基本用法和结构
version: 1.0.0
author: Kiro AI
tags: [示例, 入门, 基础]
---

# Hello World 技能

这是一个简单的Hello World示例技能，用于演示Kiro技能系统的基本结构和用法。

## 功能

- 显示友好的问候消息
- 演示基本的技能结构
- 提供技能开发的入门示例

## 使用方法

当用户需要一个简单的问候或测试技能系统时，可以使用这个技能。

### 示例场景

- 用户说"你好"或"hello"
- 需要测试技能系统是否正常工作
- 作为其他技能开发的参考模板

## 实现

```python
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
        language (str): 语言代码 (zh/en)
    
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
```

## 扩展建议

- 添加更多语言支持
- 集成时间相关的问候（早上好、下午好等）
- 添加个性化问候功能
- 集成用户偏好设置

## 注意事项

这是一个基础示例技能，主要用于学习和测试目的。在实际使用中，可以基于这个模板创建更复杂的功能。