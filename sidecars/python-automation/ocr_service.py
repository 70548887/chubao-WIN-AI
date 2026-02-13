"""
OCR 服务模块 - 基于 PaddleOCR
"""

import os
from typing import Optional, Dict, List, Any, Tuple


class OcrService:
    """OCR 文字识别服务"""
    
    def __init__(self, use_gpu: bool = False):
        """
        初始化 OCR 服务
        
        Args:
            use_gpu: 是否使用 GPU 加速 (默认 False, CPU 模式)
        """
        self.use_gpu = use_gpu
        self._ocr = None
    
    def _get_ocr(self):
        """延迟加载 OCR 引擎"""
        if self._ocr is None:
            from paddleocr import PaddleOCR
            self._ocr = PaddleOCR(
                use_angle_cls=True,
                lang='ch',
                use_gpu=self.use_gpu,
                show_log=False
            )
        return self._ocr
    
    def recognize(self, image_path: str) -> Dict[str, Any]:
        """
        识别图片中的文字
        
        Args:
            image_path: 图片路径
            
        Returns:
            识别结果，包含文字和位置信息
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f'图片不存在: {image_path}')
        
        ocr = self._get_ocr()
        result = ocr.ocr(image_path, cls=True)
        
        texts = []
        if result and result[0]:
            for line in result[0]:
                box = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                text = line[1][0]
                confidence = line[1][1]
                
                # 计算中心点
                center_x = (box[0][0] + box[2][0]) / 2
                center_y = (box[0][1] + box[2][1]) / 2
                
                texts.append({
                    'text': text,
                    'confidence': confidence,
                    'box': box,
                    'center': [int(center_x), int(center_y)]
                })
        
        return {
            'texts': texts,
            'count': len(texts),
            'image_path': image_path
        }
    
    def find_text(self, image_path: str, target_text: str) -> Dict[str, Any]:
        """
        在图片中查找指定文字
        
        Args:
            image_path: 图片路径
            target_text: 要查找的文字
            
        Returns:
            查找结果，包含是否找到和位置信息
        """
        result = self.recognize(image_path)
        
        for item in result['texts']:
            if target_text in item['text']:
                return {
                    'found': True,
                    'text': item['text'],
                    'center': item['center'],
                    'box': item['box'],
                    'confidence': item['confidence']
                }
        
        return {
            'found': False,
            'text': target_text,
            'center': None,
            'box': None
        }
    
    def find_all_text(self, image_path: str, target_text: str) -> List[Dict[str, Any]]:
        """
        在图片中查找所有匹配的文字
        
        Args:
            image_path: 图片路径
            target_text: 要查找的文字
            
        Returns:
            所有匹配结果的列表
        """
        result = self.recognize(image_path)
        
        matches = []
        for item in result['texts']:
            if target_text in item['text']:
                matches.append({
                    'text': item['text'],
                    'center': item['center'],
                    'box': item['box'],
                    'confidence': item['confidence']
                })
        
        return matches
    
    def extract_text_only(self, image_path: str) -> str:
        """
        只提取图片中的纯文字内容
        
        Args:
            image_path: 图片路径
            
        Returns:
            所有文字拼接成的字符串
        """
        result = self.recognize(image_path)
        texts = [item['text'] for item in result['texts']]
        return '\n'.join(texts)
