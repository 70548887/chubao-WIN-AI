/**
 * Voice API - 语音处理接口
 *
 * 提供语音识别（Whisper）和语音合成（TTS）功能
 */

import { Router } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import FormData from 'form-data';
import fetch from 'node-fetch';

const router = Router();

// 获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 上传配置
const uploadDir = path.join(process.cwd(), 'temp', 'audio');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    // 允许音频文件
    const allowedMimes = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/flac',
    ];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/voice/transcribe - 语音识别
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided',
      });
    }

    const audioPath = req.file.path;
    const language = req.body.language || 'zh';

    logger.info('Transcribing audio', {
      path: audioPath,
      size: req.file.size,
      language,
    });

    // 检查是否有 OpenAI API Key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // 如果没有 API Key，返回模拟结果（开发模式）
      logger.warn('No OpenAI API Key, returning mock result');
      
      // 延迟 1 秒模拟处理
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 清理文件
      fs.unlinkSync(audioPath);
      
      return res.json({
        success: true,
        text: '（模拟）这是语音识别的测试文本。请在 .env 中配置 OPENAI_API_KEY 以使用真实识别。',
        confidence: 0.95,
        language: 'zh',
        mock: true,
      });
    }

    // 调用 Whisper API
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    formData.append('response_format', 'json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Whisper API error: ${error}`);
    }

    const result = await response.json() as { text: string };

    // 清理文件
    fs.unlinkSync(audioPath);

    logger.info('Transcription completed', { text: result.text.slice(0, 50) });

    res.json({
      success: true,
      text: result.text,
      language,
    });

  } catch (error) {
    logger.error('Transcription failed', { error: (error as Error).message });
    
    // 清理文件（如果存在）
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Transcription failed',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/voice/synthesize - 语音合成
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { text, voice = 'zh-CN-XiaoxiaoNeural', speed = 1.0 } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required',
      });
    }

    logger.info('Synthesizing speech', { text: text.slice(0, 50), voice });

    // 调用 Python TTS 服务
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:3200';
    
    const response = await fetch(`${pythonServiceUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed }),
    });

    if (!response.ok) {
      throw new Error(`TTS service error: ${response.status}`);
    }

    const result = await response.json() as { audio_path: string };

    res.json({
      success: true,
      audioUrl: `/audio/${path.basename(result.audio_path)}`,
    });

  } catch (error) {
    logger.error('Synthesis failed', { error: (error as Error).message });
    
    res.status(500).json({
      success: false,
      error: 'Synthesis failed',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/voice/voices - 获取支持的语音列表
 */
router.get('/voices', (_req, res) => {
  // Edge TTS 支持的语音列表（常用中文和英文）
  const voices = [
    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（女）', lang: 'zh-CN' },
    { id: 'zh-CN-YunjianNeural', name: '云健（男）', lang: 'zh-CN' },
    { id: 'zh-CN-XiaoyiNeural', name: '晓伊（女）', lang: 'zh-CN' },
    { id: 'zh-CN-YunxiNeural', name: '云希（男）', lang: 'zh-CN' },
    { id: 'zh-CN-YunxiaNeural', name: '云夏（男）', lang: 'zh-CN' },
    { id: 'zh-CN-YunyangNeural', name: '云扬（男）', lang: 'zh-CN' },
    { id: 'zh-CN-liaoning-XiaobeiNeural', name: '晓北（东北话）', lang: 'zh-CN' },
    { id: 'zh-CN-shaanxi-XiaoniNeural', name: '晓妮（陕西话）', lang: 'zh-CN' },
    { id: 'zh-HK-HiuMaanNeural', name: '曉曼（粤语女）', lang: 'zh-HK' },
    { id: 'zh-HK-WanLungNeural', name: '雲龍（粤语男）', lang: 'zh-HK' },
    { id: 'zh-TW-HsiaoChenNeural', name: '曉臻（台湾女）', lang: 'zh-TW' },
    { id: 'zh-TW-YunJheNeural', name: '雲哲（台湾男）', lang: 'zh-TW' },
    { id: 'en-US-AriaNeural', name: 'Aria（美音女）', lang: 'en-US' },
    { id: 'en-US-GuyNeural', name: 'Guy（美音男）', lang: 'en-US' },
    { id: 'en-GB-SoniaNeural', name: 'Sonia（英音女）', lang: 'en-GB' },
    { id: 'en-GB-RyanNeural', name: 'Ryan（英音男）', lang: 'en-GB' },
  ];

  res.json({
    success: true,
    voices,
  });
});

export default router;
