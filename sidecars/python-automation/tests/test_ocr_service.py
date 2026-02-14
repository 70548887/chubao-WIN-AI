import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ocr_service import OcrService


class TestOcrService(unittest.TestCase):
    def setUp(self):
        self.service = OcrService()

    def test_normalize_result_v2_shape(self):
        raw = [
            [
                [
                    [[10, 10], [110, 10], [110, 40], [10, 40]],
                    ["HELLO", 0.98],
                ],
                [
                    [[20, 60], [140, 60], [140, 90], [20, 90]],
                    ["WORLD", 0.88],
                ],
            ]
        ]

        texts = self.service._normalize_result(raw)  # noqa: SLF001
        self.assertEqual(2, len(texts))
        self.assertEqual("HELLO", texts[0]["text"])
        self.assertEqual([60, 25], texts[0]["center"])
        self.assertGreater(texts[0]["confidence"], 0.9)

    def test_normalize_result_v3_shape(self):
        raw = [
            {
                "rec_texts": ["CHUBAOOCRTEST"],
                "rec_scores": [0.97],
                "rec_polys": [
                    [[12, 42], [320, 42], [320, 92], [12, 92]],
                ],
            }
        ]

        texts = self.service._normalize_result(raw)  # noqa: SLF001
        self.assertEqual(1, len(texts))
        self.assertEqual("CHUBAOOCRTEST", texts[0]["text"])
        self.assertEqual([166, 67], texts[0]["center"])
        self.assertGreater(texts[0]["confidence"], 0.9)

    def test_find_text_matches_substring(self):
        class StubService(OcrService):
            def recognize(self, image_path: str):
                return {
                    "texts": [
                        {
                            "text": "CHUBAO OCR TEST",
                            "confidence": 0.96,
                            "box": [[0, 0], [100, 0], [100, 20], [0, 20]],
                            "center": [50, 10],
                        }
                    ],
                    "count": 1,
                    "image_path": image_path,
                }

        stub = StubService()
        result = stub.find_text("fake.png", "CHUBAO")
        self.assertTrue(result["found"])
        self.assertEqual([50, 10], result["center"])

    def test_health_probe_fields_exist(self):
        probe = self.service.health_probe()
        self.assertIn("state", probe)
        self.assertIn("detail", probe)
        self.assertIn("dependencies", probe["detail"])
        self.assertIn("paddleocr", probe["detail"]["dependencies"])
        self.assertIn("paddle", probe["detail"]["dependencies"])


if __name__ == "__main__":
    unittest.main()
