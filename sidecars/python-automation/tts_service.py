"""
TTS Service - 语音合成服务

使用 Edge TTS 实现免费的语音合成
"""

import asyncio
import edge_tts
import os
from pathlib import Path
from typing import Optional

# 音频输出目录
AUDIO_OUTPUT_DIR = Path(__file__).parent / "output" / "audio"
AUDIO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class TTSService:
    """语音合成服务"""

    # 默认语音
    DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"

    # 常用语音列表
    VOICES = {
        # 中文
        "zh-CN-XiaoxiaoNeural": "晓晓（女）",
        "zh-CN-YunjianNeural": "云健（男）",
        "zh-CN-XiaoyiNeural": "晓伊（女）",
        "zh-CN-YunxiNeural": "云希（男）",
        "zh-CN-YunxiaNeural": "云夏（男）",
        "zh-CN-YunyangNeural": "云扬（男）",
        "zh-CN-liaoning-XiaobeiNeural": "晓北（东北话）",
        "zh-CN-shaanxi-XiaoniNeural": "晓妮（陕西话）",
        # 粤语
        "zh-HK-HiuMaanNeural": "曉曼（粤语女）",
        "zh-HK-WanLungNeural": "雲龍（粤语男）",
        # 台湾
        "zh-TW-HsiaoChenNeural": "曉臻（台湾女）",
        "zh-TW-YunJheNeural": "雲哲（台湾男）",
        # 英文
        "en-US-AriaNeural": "Aria（美音女）",
        "en-US-GuyNeural": "Guy（美音男）",
        "en-GB-SoniaNeural": "Sonia（英音女）",
        "en-GB-RyanNeural": "Ryan（英音男）",
    }

    @staticmethod
    async def synthesize(
        text: str,
        voice: Optional[str] = None,
        speed: float = 1.0,
    ) -> dict:
        """
        合成语音

        Args:
            text: 要合成的文字
            voice: 语音 ID，默认使用晓晓
            speed: 语速，1.0 为正常速度

        Returns:
            {"audio_path": str, "duration": float}
        """
        if not text.strip():
            raise ValueError("Text cannot be empty")

        voice = voice or TTSService.DEFAULT_VOICE

        # 生成输出文件名
        import hashlib
        import time

        text_hash = hashlib.md5(f"{text}_{voice}_{speed}".encode()).hexdigest()[:8]
        timestamp = int(time.time())
        output_file = AUDIO_OUTPUT_DIR / f"tts_{timestamp}_{text_hash}.mp3"

        try:
            # 创建 TTS 通信对象
            communicate = edge_tts.Communicate(
                text=text,
                voice=voice,
                rate=f"{int((speed - 1) * 100)}%" if speed != 1.0 else "+0%",
            )

            # 保存音频
            await communicate.save(str(output_file))

            # 获取音频时长（简化估算，每 100 字约 4 秒）
            estimated_duration = len(text) * 0.25

            return {
                "audio_path": str(output_file),
                "duration": estimated_duration,
                "voice": voice,
                "text": text[:100] + "..." if len(text) > 100 else text,
            }

        except Exception as e:
            # 清理失败的文件
            if output_file.exists():
                output_file.unlink()
            raise Exception(f"TTS synthesis failed: {str(e)}")

    @staticmethod
    def get_voices() -> list:
        """获取支持的语音列表"""
        return [
            {"id": k, "name": v, "lang": k.split("-")[0] + "-" + k.split("-")[1]}
            for k, v in TTSService.VOICES.items()
        ]

    @staticmethod
    def cleanup_old_files(max_age_hours: int = 24):
        """清理旧的音频文件"""
        import time

        current_time = time.time()
        max_age_seconds = max_age_hours * 3600

        cleaned = 0
        for file_path in AUDIO_OUTPUT_DIR.glob("*.mp3"):
            try:
                file_age = current_time - file_path.stat().st_mtime
                if file_age > max_age_seconds:
                    file_path.unlink()
                    cleaned += 1
            except Exception as e:
                print(f"Failed to cleanup {file_path}: {e}")

        return cleaned


# 同步接口（供 Flask 调用）
def synthesize_sync(text: str, voice: Optional[str] = None, speed: float = 1.0) -> dict:
    """同步合成语音（阻塞调用）"""
    return asyncio.run(TTSService.synthesize(text, voice, speed))


def get_voices_sync() -> list:
    """同步获取语音列表"""
    return TTSService.get_voices()


if __name__ == "__main__":
    # 测试
    async def test():
        print("Testing TTS Service...")

        # 测试合成
        result = await TTSService.synthesize(
            "你好，我是触宝AI的语音助手。",
            voice="zh-CN-XiaoxiaoNeural",
        )
        print(f"Generated: {result}")

        # 测试语音列表
        voices = TTSService.get_voices()
        print(f"Available voices: {len(voices)}")

    asyncio.run(test())
