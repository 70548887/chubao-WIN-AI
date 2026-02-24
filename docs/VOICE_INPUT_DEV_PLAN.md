# 语音输入系统开发计划

> 目标：实现语音录制、Whisper 语音识别、语音合成功能
> 创建时间：2026-02-17
> 预估工时：4 天

---

## 功能需求

### 核心功能
- 语音录制：按住按钮录制用户语音
- 语音识别：使用 Whisper API 将语音转为文字
- 语音合成：使用 Edge TTS 将 AI 回复转为语音
- 实时显示：录制时显示音量和时长

### 用户体验
- 聊天界面添加语音输入按钮
- 录制时显示波形动画
- 支持取消录制
- 语音播放控制（播放/暂停）

---

## 技术方案

### 1. 录音方案

使用 Web Audio API + MediaRecorder：

```typescript
// 获取麦克风权限
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream);

// 录制音频
const chunks: Blob[] = [];
mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
mediaRecorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  // 发送到后端识别
};
```

### 2. 语音识别

使用 OpenAI Whisper API：

```typescript
// 后端调用 Whisper
const formData = new FormData();
formData.append('file', audioBlob);
formData.append('model', 'whisper-1');
formData.append('language', 'zh');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: formData,
});
```

### 3. 语音合成

使用 Edge TTS（免费）：

```python
# Python 后端使用 edge-tts
import edge_tts

communicate = edge_tts.Communicate("你好", "zh-CN-XiaoxiaoNeural")
await communicate.save("output.mp3")
```

---

## 开发步骤

### Phase 1: 录音功能 (Day 1)

#### T1.1: 创建录音 Hook
**文件**: `src/hooks/useAudioRecorder.ts`

**功能**:
- 开始/停止录音
- 获取麦克风权限
- 返回音频 Blob
- 显示录音时长

#### T1.2: 创建录音按钮组件
**文件**: `src/components/VoiceInputButton.tsx`

**功能**:
- 按住录音，松开停止
- 显示录音状态
- 波形动画效果

### Phase 2: 语音识别 API (Day 2)

#### T2.1: 后端添加 Whisper 接口
**文件**: `sidecars/node-backend/src/api/voice.ts`

**功能**:
- 接收音频文件
- 调用 Whisper API
- 返回识别文字

#### T2.2: 前端集成语音识别
**文件**: `src/services/voiceService.ts`

**功能**:
- 发送音频到后端
- 获取识别结果
- 错误处理

### Phase 3: 语音合成 (Day 3)

#### T3.1: Python 添加 TTS 服务
**文件**: `sidecars/python-automation/tts_service.py`

**功能**:
- 使用 edge-tts 合成语音
- 保存为音频文件
- 返回音频路径

#### T3.2: 后端添加 TTS 接口
**文件**: `sidecars/node-backend/src/api/tts.ts`

**功能**:
- 接收文字内容
- 调用 Python TTS
- 返回音频文件

### Phase 4: 集成优化 (Day 4)

#### T4.1: 聊天界面集成
**文件**: `src/components/Chat.tsx`

**改动**:
- 添加语音输入按钮
- 显示识别结果
- 播放 AI 语音回复

#### T4.2: 设置面板
**文件**: `src/components/SettingsPanelNew.tsx`

**改动**:
- 语音设置选项
- 选择语音角色
- 开启/关闭语音播报

---

## 文件变更清单

### 新增文件
- `src/hooks/useAudioRecorder.ts` - 录音 Hook
- `src/components/VoiceInputButton.tsx` - 语音输入按钮
- `src/services/voiceService.ts` - 语音服务
- `sidecars/node-backend/src/api/voice.ts` - 语音识别 API
- `sidecars/node-backend/src/api/tts.ts` - 语音合成 API
- `sidecars/python-automation/tts_service.py` - Python TTS 服务

### 修改文件
- `src/components/Chat.tsx` - 集成语音输入
- `src/components/SettingsPanelNew.tsx` - 语音设置
- `sidecars/node-backend/src/index.ts` - 注册 API 路由

---

## 验收标准

### 功能验收
- [ ] 按住按钮可以录制语音
- [ ] 录音时长正确显示
- [ ] 语音识别准确率 > 95%
- [ ] 语音合成自然流畅
- [ ] 支持取消录制

### 性能验收
- [ ] 录音延迟 < 100ms
- [ ] 识别响应 < 3s
- [ ] 合成响应 < 5s

### 代码验收
- [ ] 无 TypeScript 错误
- [ ] 麦克风权限处理完善
- [ ] 错误处理完整

---

## 依赖关系

```
T1.1 (录音 Hook)
    ↓
T1.2 (录音按钮)
    ↓
T2.1 (Whisper API) ←→ T2.2 (语音服务)
    ↓
T3.1 (TTS Python) ←→ T3.2 (TTS API)
    ↓
T4.1 (Chat 集成) ←→ T4.2 (设置面板)
```

---

## 下一步行动

1. ✅ 创建开发计划文档 (当前)
2. ⏳ 开始 Phase 1: 创建录音 Hook
3. ⏳ 创建录音按钮组件

---

*文档版本: v1.0 | 最后更新: 2026-02-17*
