# Chubao AI 部署指南

> 本文档介绍如何将 Chubao AI 打包为可分发的 Windows 应用程序

## 目录

1. [环境准备](#环境准备)
2. [开发模式运行](#开发模式运行)
3. [打包生产版本](#打包生产版本)
4. [Sidecar 嵌入配置](#sidecar-嵌入配置)
5. [发布检查清单](#发布检查清单)

---

## 环境准备

### 必需软件

1. **Node.js 22+**
   - 下载地址: https://nodejs.org/
   - 验证: `node --version`

2. **Python 3.9+**
   - 下载地址: https://www.python.org/
   - 验证: `python --version`
   - 安装时勾选 "Add to PATH"

3. **Rust 1.75+** (仅 Tauri 开发需要)
   - 下载地址: https://rustup.rs/
   - 验证: `rustc --version`

4. **Visual Studio Build Tools** (Windows)
   - 下载地址: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - 安装 "Desktop development with C++" 工作负载

### 安装依赖

```bash
# 1. 克隆仓库
git clone https://github.com/your-repo/chubao-WIN-AI.git
cd chubao-WIN-AI

# 2. 安装前端依赖
npm install

# 3. 安装 Node.js Sidecar 依赖
cd sidecars/node-backend
npm install
cd ../..

# 4. 安装 Python Sidecar 依赖
cd sidecars/python-automation
pip install -r requirements.txt
cd ../..
```

---

## 开发模式运行

### 方式 1: 完整开发环境 (推荐)

```bash
# 启动所有服务 (前端 + Node + Python)
.\scripts\start.ps1 -Mode all

# 或在 PowerShell 中
./scripts/start.ps1 -Mode all
```

### 方式 2: 仅后端服务

```bash
.\scripts\start.ps1 -Mode cli
```

这将启动:
- Node.js Backend: http://localhost:3100
- Python Automation: http://localhost:3200

### 方式 3: 使用 Tauri 桌面应用

```bash
.\scripts\start.ps1 -Mode tauri
```

或手动:

```bash
# 终端 1: 启动 Python
python sidecars/python-automation/main.py

# 终端 2: 启动 Node.js
cd sidecars/node-backend && npm run dev

# 终端 3: 启动 Tauri
cd ../.. && npm run tauri:dev
```

---

## 打包生产版本

### 步骤 1: 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入生产环境配置
```

### 步骤 2: 构建 Node.js Sidecar

```bash
cd sidecars/node-backend
npm run build
```

这会在 `dist/` 目录生成打包后的 JavaScript 文件。

### 步骤 3: 准备 Python Sidecar

Python Sidecar 不需要构建，但需要确保:

1. 所有依赖都已安装: `pip install -r requirements.txt`
2. 代码可以直接运行: `python main.py`

### 步骤 4: 构建 Tauri 应用

```bash
# 在项目根目录
npm run tauri:build
```

构建完成后，安装包位于:
- `src-tauri/target/release/bundle/nsis/` - NSIS 安装程序
- `src-tauri/target/release/chubao-win-ai.exe` - 可执行文件

---

## Sidecar 嵌入配置

### 当前配置

Tauri 配置文件中已配置 externalBin:

```json
// src-tauri/tauri.conf.json
{
  "bundle": {
    "externalBin": [
      "sidecars/node-backend/node-backend",
      "sidecars/python-automation/python-automation"
    ]
  }
}
```

### Sidecar 打包脚本

为了将 Node.js 和 Python 运行时嵌入到安装包中，需要创建 Sidecar 可执行文件。

#### Node.js Sidecar

方案 1: 使用 pkg 打包为可执行文件

```bash
# 安装 pkg
cd sidecars/node-backend
npm install -g pkg

# 打包
pkg dist/index.js --target node18-win-x64 --output node-backend.exe
```

方案 2: 使用 nexe

```bash
npm install -g nexe
nexe dist/index.js --build --output node-backend.exe
```

#### Python Sidecar

方案 1: 使用 PyInstaller

```bash
cd sidecars/python-automation
pip install pyinstaller

# 创建 spec 文件
pyi-makespec main.py --onefile --name python-automation

# 打包
pyinstaller python-automation.spec
```

方案 2: 使用 cx_Freeze

```bash
pip install cx_Freeze
python setup.py build
```

### 部署结构

打包后的目录结构:

```
Chubao AI/
├── chubao-win-ai.exe      # Tauri 主程序
├── sidecars/
│   ├── node-backend/
│   │   └── node-backend.exe
│   └── python-automation/
│       └── python-automation.exe
├── memory/                 # 记忆存储目录
├── life/                   # 知识图谱目录
└── .env                   # 环境变量
```

---

## 发布检查清单

### 功能测试

- [ ] 应用正常启动
- [ ] 前端 UI 显示正常
- [ ] Node.js Sidecar 启动成功
- [ ] Python Sidecar 启动成功
- [ ] AI 对话功能正常
- [ ] GUI 自动化工具可用
- [ ] OCR 文字识别正常
- [ ] 记忆系统工作正常
- [ ] 飞书集成 (如配置)
- [ ] Telegram 集成 (如配置)
- [ ] WhatsApp 集成 (如配置)

### 打包检查

- [ ] 安装程序大小合理 (< 200MB)
- [ ] 安装过程无错误
- [ ] 桌面快捷方式创建成功
- [ ] 开始菜单项创建成功
- [ ] 卸载功能正常
- [ ] 无运行时依赖警告

### 环境检查

- [ ] 在无 Node.js 环境的机器上测试
- [ ] 在无 Python 环境的机器上测试
- [ ] Windows 10 测试
- [ ] Windows 11 测试

---

## 常见问题

### Q: 打包后 Sidecar 无法启动

A: 检查:
1. Sidecar 可执行文件是否在正确的位置
2. Sidecar 是否有执行权限
3. 依赖项是否完整打包

### Q: 安装包过大

A: 优化方案:
1. 使用 UPX 压缩可执行文件
2. 移除不必要的依赖
3. 分离可选组件

### Q: 启动时提示缺少 DLL

A: 安装 Visual C++ Redistributable:
https://aka.ms/vs/17/release/vc_redist.x64.exe

---

## 自动构建脚本

### GitHub Actions 工作流

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
          
      - name: Setup Rust
        uses: dtolnay/rust-action@stable
        
      - name: Install dependencies
        run: |
          npm install
          cd sidecars/node-backend && npm install
          cd ../python-automation && pip install -r requirements.txt
          
      - name: Build Sidecars
        run: |
          cd sidecars/node-backend && npm run build
          # 打包 Python
          cd ../python-automation && pyinstaller main.py --onefile
          
      - name: Build Tauri
        run: npm run tauri:build
        
      - name: Upload Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            src-tauri/target/release/bundle/nsis/*.exe
```

---

*文档版本: v1.0 | 最后更新: 2026-02-13*
