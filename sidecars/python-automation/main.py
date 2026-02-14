"""
Chubao AI - Python 自动化服务入口
提供 GUI 控制和 OCR 识别能力
"""

import os
import time
import uuid
from typing import Any, Dict, Optional, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

from gui_control import GuiController
from ocr_service import OcrService

load_dotenv()

app = Flask(__name__)
CORS(app)

gui = GuiController()
ocr = OcrService()

PORT = int(os.getenv("PYTHON_PORT", "3200"))
APP_VERSION = os.getenv("PYTHON_AUTOMATION_VERSION", "0.1.0")
STARTED_AT = time.time()


def _request_id() -> str:
    return str(uuid.uuid4())


def _error_response(
    error_code: str,
    message: str,
    status_code: int = 500,
    details: Optional[Dict[str, Any]] = None,
):
    payload: Dict[str, Any] = {
        "success": False,
        "errorCode": error_code,
        "message": message,
        "requestId": _request_id(),
    }
    if details is not None:
        payload["details"] = details
    return jsonify(payload), status_code


def _ok(**kwargs: Any):
    payload: Dict[str, Any] = {"success": True}
    payload.update(kwargs)
    return jsonify(payload)


def _body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _classify_exception(exc: Exception) -> Tuple[str, int]:
    if isinstance(exc, (ValueError, FileNotFoundError, TypeError)):
        return "INVALID_ARGUMENT", 400
    if isinstance(exc, TimeoutError):
        return "TIMEOUT", 504

    message = str(exc).lower()
    if "not found" in message or "未找到" in message:
        return "INVALID_ARGUMENT", 400
    if "dependency" in message or "module" in message:
        return "DEPENDENCY_UNAVAILABLE", 503
    if "ocr failed" in message or "paddle" in message:
        return "DEPENDENCY_UNAVAILABLE", 503
    return "INTERNAL_ERROR", 500


def _exception_response(exc: Exception):
    error_code, status_code = _classify_exception(exc)
    return _error_response(error_code, str(exc), status_code)


@app.route("/health", methods=["GET"])
def health():
    ocr_probe = ocr.health_probe()
    deps = {
        "gui": "ok",
        "ocr": ocr_probe.get("state", "degraded"),
        "screenshot": "ok",
    }

    status = "ok" if all(state == "ok" for state in deps.values()) else "degraded"

    return jsonify(
        {
            "status": status,
            "service": "python-automation",
            "version": APP_VERSION,
            "uptimeSec": max(0, int(time.time() - STARTED_AT)),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "deps": deps,
            "ocr": ocr_probe.get("detail", {}),
        }
    )


@app.route("/api/windows", methods=["GET"])
def list_windows():
    try:
        windows = gui.list_windows()
        return _ok(windows=windows)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/window/controls", methods=["POST"])
def get_controls():
    data = _body()
    title = data.get("title")
    if not title:
        return _error_response(
            "INVALID_ARGUMENT",
            "title is required",
            400,
            {"field": "title"},
        )

    try:
        controls = gui.get_controls(str(title))
        return _ok(controls=controls)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/click", methods=["POST"])
def click():
    data = _body()
    has_coordinates = data.get("x") is not None and data.get("y") is not None
    has_target = bool(data.get("target")) and bool(data.get("window_title"))

    if not has_coordinates and not has_target:
        return _error_response(
            "INVALID_ARGUMENT",
            "either (x,y) or (target,window_title) is required",
            400,
            {"fields": ["x", "y", "target", "window_title"]},
        )

    try:
        result = gui.click(
            x=data.get("x"),
            y=data.get("y"),
            target=data.get("target"),
            window_title=data.get("window_title"),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/type", methods=["POST"])
def type_text():
    data = _body()
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        return _error_response(
            "INVALID_ARGUMENT",
            "text is required",
            400,
            {"field": "text"},
        )

    try:
        result = gui.type_text(
            text=text,
            target=data.get("target"),
            window_title=data.get("window_title"),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/menu", methods=["POST"])
def menu_select():
    data = _body()
    menu_path = data.get("menu_path")
    window_title = data.get("window_title")
    if not menu_path or not window_title:
        return _error_response(
            "INVALID_ARGUMENT",
            "menu_path and window_title are required",
            400,
            {"fields": ["menu_path", "window_title"]},
        )

    try:
        result = gui.menu_select(menu_path=str(menu_path), window_title=str(window_title))
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/screenshot", methods=["POST"])
def screenshot():
    data = _body()
    try:
        result = gui.screenshot(
            region=data.get("region"),
            window_title=data.get("window_title"),
            save_path=data.get("save_path"),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/ocr", methods=["POST"])
def ocr_recognize():
    data = _body()
    image_path = data.get("image_path")

    try:
        if not image_path:
            screenshot_result = gui.screenshot()
            image_path = screenshot_result.get("path")

        result = ocr.recognize(str(image_path))
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/ocr/find", methods=["POST"])
def ocr_find_text():
    data = _body()
    text = data.get("text")
    image_path = data.get("image_path")

    if not text:
        return _error_response(
            "INVALID_ARGUMENT",
            "text is required",
            400,
            {"field": "text"},
        )

    try:
        if not image_path:
            screenshot_result = gui.screenshot()
            image_path = screenshot_result.get("path")

        result = ocr.find_text(str(image_path), str(text))
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/ocr/click", methods=["POST"])
def ocr_click_text():
    data = _body()
    text = data.get("text")

    if not text:
        return _error_response(
            "INVALID_ARGUMENT",
            "text is required",
            400,
            {"field": "text"},
        )

    try:
        screenshot_result = gui.screenshot()
        image_path = screenshot_result.get("path")

        find_result = ocr.find_text(str(image_path), str(text))
        if not find_result.get("found"):
            return _error_response(
                "SERVICE_UNAVAILABLE",
                f"text not found on screen: {text}",
                503,
                {"text": text},
            )

        x, y = find_result["center"]
        gui.click(x=x, y=y)

        return _ok(result={"clicked": text, "position": [x, y]})
    except Exception as exc:
        return _exception_response(exc)


if __name__ == "__main__":
    print(f"🐍 Python 自动化服务启动: http://localhost:{PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=False)
