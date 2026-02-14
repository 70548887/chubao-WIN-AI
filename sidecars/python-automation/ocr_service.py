"""
OCR service module based on PaddleOCR.
Compatible with both PaddleOCR 2.x and 3.x APIs.
"""

from __future__ import annotations

import importlib.util
import inspect
import os
from typing import Any, Dict, List, Optional


class OcrService:
    """OCR text recognition service."""

    def __init__(self, use_gpu: bool = False):
        self.use_gpu = use_gpu
        self._ocr: Any = None
        self._last_error: Optional[str] = None
        self._last_api_version: str = "unknown"

        # PaddleOCR 3.x runs a host connectivity pre-check by default.
        # We skip it to avoid startup latency and rely on actual inference calls.
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

    def _module_exists(self, module_name: str) -> bool:
        return importlib.util.find_spec(module_name) is not None

    def health_probe(self) -> Dict[str, Any]:
        paddleocr_ready = self._module_exists("paddleocr")
        paddle_ready = self._module_exists("paddle")
        dependencies_ok = paddleocr_ready and paddle_ready
        runtime_ok = self._last_error is None

        state = "ok" if dependencies_ok and runtime_ok else "degraded"
        return {
            "state": state,
            "detail": {
                "dependencies": {
                    "paddleocr": paddleocr_ready,
                    "paddle": paddle_ready,
                },
                "engineInitialized": self._ocr is not None,
                "apiVersion": self._last_api_version,
                "lastError": self._last_error,
            },
        }

    def _get_ocr(self):
        """Lazily initialize OCR engine."""
        if self._ocr is not None:
            return self._ocr

        from paddleocr import PaddleOCR

        signature = inspect.signature(PaddleOCR.__init__)
        params = set(signature.parameters.keys())

        # PaddleOCR 2.x style parameters.
        if "use_gpu" in params:
            self._last_api_version = "v2"
            self._ocr = PaddleOCR(
                use_angle_cls=True,
                lang="ch",
                use_gpu=self.use_gpu,
                show_log=False,
            )
            return self._ocr

        # PaddleOCR 3.x style parameters.
        self._last_api_version = "v3"
        init_kwargs: Dict[str, Any] = {
            "lang": "ch",
            "device": "gpu" if self.use_gpu else "cpu",
            # Workaround for known CPU execution issues under PaddleOCR 3.x + oneDNN.
            "enable_mkldnn": False,
            "enable_hpi": False,
        }

        # Disable document preprocessing models for lighter desktop OCR scenarios.
        if "use_doc_orientation_classify" in params:
            init_kwargs["use_doc_orientation_classify"] = False
        if "use_doc_unwarping" in params:
            init_kwargs["use_doc_unwarping"] = False
        if "use_textline_orientation" in params:
            init_kwargs["use_textline_orientation"] = False

        self._ocr = PaddleOCR(**init_kwargs)
        return self._ocr

    def _coerce_box(self, raw_box: Any) -> List[List[int]]:
        if raw_box is None:
            return []
        if hasattr(raw_box, "tolist"):
            raw_box = raw_box.tolist()
        if not isinstance(raw_box, list):
            return []

        points: List[List[int]] = []
        for point in raw_box:
            if hasattr(point, "tolist"):
                point = point.tolist()
            if not isinstance(point, list) or len(point) < 2:
                continue
            x = int(round(float(point[0])))
            y = int(round(float(point[1])))
            points.append([x, y])
        return points

    def _center_from_box(self, box: List[List[int]]) -> List[int]:
        if not box:
            return [0, 0]
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        return [int(round(sum(xs) / len(xs))), int(round(sum(ys) / len(ys)))]

    def _normalize_result(self, raw_result: Any) -> List[Dict[str, Any]]:
        texts: List[Dict[str, Any]] = []

        if not isinstance(raw_result, list) or len(raw_result) == 0:
            return texts

        first = raw_result[0]

        # PaddleOCR 2.x shape: [[ [box], [text, score] ], ...]
        if isinstance(first, list):
            for line in first:
                if not isinstance(line, list) or len(line) < 2:
                    continue
                box = self._coerce_box(line[0])
                text_info = line[1]
                if (
                    not isinstance(text_info, (list, tuple))
                    or len(text_info) < 2
                    or not isinstance(text_info[0], str)
                ):
                    continue
                text = text_info[0]
                confidence = float(text_info[1])
                texts.append(
                    {
                        "text": text,
                        "confidence": confidence,
                        "box": box,
                        "center": self._center_from_box(box),
                    }
                )
            return texts

        # PaddleOCR 3.x shape: [{ rec_texts: [], rec_scores: [], rec_polys/dt_polys: [] }]
        if isinstance(first, dict):
            rec_texts = first.get("rec_texts") or []
            rec_scores = first.get("rec_scores") or []
            rec_polys = first.get("rec_polys") or first.get("dt_polys") or []

            for idx, item in enumerate(rec_texts):
                if not isinstance(item, str):
                    continue
                score = 0.0
                if idx < len(rec_scores) and rec_scores[idx] is not None:
                    score = float(rec_scores[idx])

                raw_box = rec_polys[idx] if idx < len(rec_polys) else None
                box = self._coerce_box(raw_box)
                texts.append(
                    {
                        "text": item,
                        "confidence": score,
                        "box": box,
                        "center": self._center_from_box(box),
                    }
                )

        return texts

    def recognize(self, image_path: str) -> Dict[str, Any]:
        """Recognize text in image."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"image not found: {image_path}")

        try:
            ocr = self._get_ocr()
            if hasattr(ocr, "predict"):
                raw_result = ocr.predict(image_path)
            else:
                raw_result = ocr.ocr(image_path, cls=True)
            texts = self._normalize_result(raw_result)
            self._last_error = None
        except Exception as exc:
            self._last_error = str(exc)
            raise RuntimeError(f"OCR failed: {exc}") from exc

        return {
            "texts": texts,
            "count": len(texts),
            "image_path": image_path,
        }

    def find_text(self, image_path: str, target_text: str) -> Dict[str, Any]:
        """Find first text occurrence."""
        result = self.recognize(image_path)
        for item in result["texts"]:
            if target_text in item["text"]:
                return {
                    "found": True,
                    "text": item["text"],
                    "center": item["center"],
                    "box": item["box"],
                    "confidence": item["confidence"],
                }
        return {
            "found": False,
            "text": target_text,
            "center": None,
            "box": None,
        }

    def find_all_text(self, image_path: str, target_text: str) -> List[Dict[str, Any]]:
        """Find all matching text occurrences."""
        result = self.recognize(image_path)
        matches: List[Dict[str, Any]] = []
        for item in result["texts"]:
            if target_text in item["text"]:
                matches.append(
                    {
                        "text": item["text"],
                        "center": item["center"],
                        "box": item["box"],
                        "confidence": item["confidence"],
                    }
                )
        return matches

    def extract_text_only(self, image_path: str) -> str:
        """Extract only plain text lines."""
        result = self.recognize(image_path)
        return "\n".join([item["text"] for item in result["texts"]])
