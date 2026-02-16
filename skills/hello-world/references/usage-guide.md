# Hello World 技能使用指南

## 快速开始

这个技能提供了基本的问候功能，是学习Kiro技能系统的理想起点。

## 主要功能

### 1. 基本问候

```python
from hello import hello_world

# 默认问候
print(hello_world())  # 输出: 你好，世界！欢迎使用Kiro AI助手！

# 自定义问候
print(hello_world("小明"))  # 输出: 你好，小明！欢迎使用Kiro AI助手！
```

### 2. 多语言问候

```python
from hello import get_greeting

print(get_greeting("zh"))  # 你好，世界！
print(get_greeting("en"))  # Hello, World!
print(get_greeting("ja"))  # こんにちは、世界！
print(get_greeting("ko"))  # 안녕하세요, 세계!
```

### 3. 时间相关问候

```python
from hello import time_based_greeting

print(time_based_greeting())     # 根据当前时间返回合适的问候
print(time_based_greeting("en")) # 英文时间问候
```

## 运行测试

```bash
python test_hello.py
```

## 扩展示例

基于这个技能，你可以创建更复杂的功能：

- 添加用户偏好记忆
- 集成天气信息
- 添加节日问候
- 支持更多语言

## 技能开发最佳实践

1. **保持简单**: 每个技能专注于特定功能
2. **文档完整**: 提供清晰的使用说明
3. **测试覆盖**: 编写单元测试确保质量
4. **错误处理**: 优雅处理异常情况
5. **可扩展性**: 设计时考虑未来扩展需求
