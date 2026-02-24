"""
Chubao AI - Python 自动化服务入口
提供 GUI 控制和 OCR 识别能力
"""

import os
import time
import uuid
import base64
import io
from typing import Any, Dict, Optional, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from PIL import Image

from gui_control import GuiController
from ocr_service import OcrService
from browser_control import BrowserController
from tts_service import synthesize_sync, get_voices_sync

load_dotenv()

app = Flask(__name__)
CORS(app)

gui = GuiController()
# OCR service will be initialized lazily on first use
ocr = None

def get_ocr():
    global ocr
    if ocr is None:
        ocr = OcrService()
    return ocr
browser = BrowserController()

PORT = int(os.getenv("PYTHON_PORT", "3200"))
APP_VERSION = os.getenv("PYTHON_AUTOMATION_VERSION", "0.1.0")
STARTED_AT = time.time()


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except Exception:
        return default


MODEL_COORD_WIDTH = _env_positive_int(
    "CHUBAO_MODEL_COORD_WIDTH",
    _env_positive_int("CHUBAO_MODEL_VIEWPORT_WIDTH", 1024),
)
MODEL_COORD_HEIGHT = _env_positive_int(
    "CHUBAO_MODEL_COORD_HEIGHT",
    _env_positive_int("CHUBAO_MODEL_VIEWPORT_HEIGHT", 768),
)


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
    if "playwright" in message:
        return "DEPENDENCY_UNAVAILABLE", 503
    if "ocr failed" in message or "paddle" in message:
        return "DEPENDENCY_UNAVAILABLE", 503
    return "INTERNAL_ERROR", 500


def _exception_response(exc: Exception):
    error_code, status_code = _classify_exception(exc)
    return _error_response(error_code, str(exc), status_code)


def _browser_controller() -> BrowserController:
    return browser


@app.route("/health", methods=["GET"])
def health():
    ocr_probe = get_ocr().health_probe() if ocr else {"state": "not_initialized", "detail": {}}
    browser_probe = browser.health_probe()
    deps = {
        "gui": "ok",
        "ocr": ocr_probe.get("state", "degraded"),
        "browser": browser_probe.get("state", "degraded"),
        "screenshot": "ok",
        "tts": "ok",
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
            "browser": browser_probe.get("detail", {}),
        }
    )


@app.route("/api/tts", methods=["POST"])
def text_to_speech():
    """文本转语音"""
    try:
        data = _body()
        text = data.get("text", "").strip()
        voice = data.get("voice", "zh-CN-XiaoxiaoNeural")
        speed = float(data.get("speed", 1.0))

        if not text:
            return _error_response("INVALID_ARGUMENT", "text is required", 400)

        result = synthesize_sync(text, voice, speed)
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/tts/voices", methods=["GET"])
def list_voices():
    """获取支持的语音列表"""
    try:
        voices = get_voices_sync()
        return _ok(voices=voices)
    except Exception as exc:
        return _exception_response(exc)


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


@app.route("/api/right_click", methods=["POST"])
def right_click():
    data = _body()
    x = data.get("x")
    y = data.get("y")

    if x is None or y is None:
        return _error_response(
            "INVALID_ARGUMENT",
            "x and y are required",
            400,
            {"fields": ["x", "y"]},
        )

    try:
        result = gui.right_click(int(x), int(y))
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/double_click", methods=["POST"])
def double_click():
    data = _body()
    x = data.get("x")
    y = data.get("y")
    interval = data.get("interval", 0.1)

    if x is None or y is None:
        return _error_response(
            "INVALID_ARGUMENT",
            "x and y are required",
            400,
            {"fields": ["x", "y"]},
        )

    try:
        result = gui.double_click(int(x), int(y), float(interval))
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/hover", methods=["POST"])
def hover():
    data = _body()
    x = data.get("x")
    y = data.get("y")
    duration = data.get("duration", 0.0)

    if x is None or y is None:
        return _error_response(
            "INVALID_ARGUMENT",
            "x and y are required",
            400,
            {"fields": ["x", "y"]},
        )

    try:
        result = gui.hover(int(x), int(y), float(duration))
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/drag", methods=["POST"])
def drag():
    data = _body()
    start_x = data.get("start_x")
    start_y = data.get("start_y")
    end_x = data.get("end_x")
    end_y = data.get("end_y")
    duration = data.get("duration", 0.2)
    button = data.get("button", "left")

    if None in [start_x, start_y, end_x, end_y]:
        return _error_response(
            "INVALID_ARGUMENT",
            "start_x,start_y,end_x,end_y are required",
            400,
            {"fields": ["start_x", "start_y", "end_x", "end_y"]},
        )

    try:
        result = gui.drag(
            start_x=int(start_x),
            start_y=int(start_y),
            end_x=int(end_x),
            end_y=int(end_y),
            duration=float(duration),
            button=str(button),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/launch", methods=["POST"])
def browser_launch():
    data = _body()
    headless = bool(data.get("headless", False))
    width = data.get("width", 1280)
    height = data.get("height", 720)

    try:
        if int(width) <= 0 or int(height) <= 0:
            return _error_response(
                "INVALID_ARGUMENT",
                "width and height must be positive integers",
                400,
                {"fields": ["width", "height"]},
            )

        result = _browser_controller().launch(
            headless=headless,
            width=int(width),
            height=int(height),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/navigate", methods=["POST"])
def browser_navigate():
    data = _body()
    url = data.get("url")
    wait_until = data.get("wait_until", "domcontentloaded")
    timeout_ms = data.get("timeout_ms", 30000)

    if not isinstance(url, str) or not url.strip():
        return _error_response(
            "INVALID_ARGUMENT",
            "url is required",
            400,
            {"field": "url"},
        )

    try:
        result = _browser_controller().navigate(
            url=url,
            wait_until=str(wait_until),
            timeout_ms=int(timeout_ms),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/click", methods=["POST"])
def browser_click():
    data = _body()
    selector = data.get("selector")
    timeout_ms = data.get("timeout_ms", 10000)

    if not isinstance(selector, str) or not selector.strip():
        return _error_response(
            "INVALID_ARGUMENT",
            "selector is required",
            400,
            {"field": "selector"},
        )

    try:
        result = _browser_controller().click(
            selector=selector.strip(),
            timeout_ms=int(timeout_ms),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/type", methods=["POST"])
def browser_type():
    data = _body()
    selector = data.get("selector")
    text = data.get("text")
    clear = bool(data.get("clear", False))
    timeout_ms = data.get("timeout_ms", 10000)

    if not isinstance(selector, str) or not selector.strip():
        return _error_response(
            "INVALID_ARGUMENT",
            "selector is required",
            400,
            {"field": "selector"},
        )

    if not isinstance(text, str):
        return _error_response(
            "INVALID_ARGUMENT",
            "text is required",
            400,
            {"field": "text"},
        )

    try:
        result = _browser_controller().type_text(
            selector=selector.strip(),
            text=text,
            clear=clear,
            timeout_ms=int(timeout_ms),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/press", methods=["POST"])
def browser_press():
    data = _body()
    key = data.get("key")

    if not isinstance(key, str) or not key.strip():
        return _error_response(
            "INVALID_ARGUMENT",
            "key is required",
            400,
            {"field": "key"},
        )

    try:
        result = _browser_controller().press(key.strip())
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/scroll", methods=["POST"])
def browser_scroll():
    data = _body()
    delta_x = data.get("delta_x", 0)
    delta_y = data.get("delta_y", 600)

    try:
        result = _browser_controller().scroll(
            delta_x=int(delta_x),
            delta_y=int(delta_y),
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/read_page", methods=["POST"])
def browser_read_page():
    data = _body()
    include_html = bool(data.get("include_html", True))
    include_forms = bool(data.get("include_forms", True))
    max_html_chars = data.get("max_html_chars", 40000)

    try:
        max_html_value = int(max_html_chars)
        if max_html_value <= 0:
            return _error_response(
                "INVALID_ARGUMENT",
                "max_html_chars must be a positive integer",
                400,
                {"field": "max_html_chars"},
            )

        result = _browser_controller().read_page(
            include_html=include_html,
            include_forms=include_forms,
            max_html_chars=max_html_value,
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/get_text", methods=["POST"])
def browser_get_text():
    data = _body()
    selector = data.get("selector")
    max_chars = data.get("max_chars", 8000)
    normalize_whitespace = bool(data.get("normalize_whitespace", True))
    timeout_ms = data.get("timeout_ms", 10000)

    if selector is not None and (not isinstance(selector, str) or not selector.strip()):
        return _error_response(
            "INVALID_ARGUMENT",
            "selector must be a non-empty string when provided",
            400,
            {"field": "selector"},
        )

    try:
        max_chars_value = int(max_chars)
        timeout_value = int(timeout_ms)
        if max_chars_value <= 0:
            return _error_response(
                "INVALID_ARGUMENT",
                "max_chars must be a positive integer",
                400,
                {"field": "max_chars"},
            )
        if timeout_value <= 0:
            return _error_response(
                "INVALID_ARGUMENT",
                "timeout_ms must be a positive integer",
                400,
                {"field": "timeout_ms"},
            )

        result = _browser_controller().get_text(
            selector=selector.strip() if isinstance(selector, str) else None,
            max_chars=max_chars_value,
            normalize_whitespace=normalize_whitespace,
            timeout_ms=timeout_value,
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/form_input", methods=["POST"])
def browser_form_input():
    data = _body()
    fields = data.get("fields")
    clear = bool(data.get("clear", True))
    submit = bool(data.get("submit", False))
    submit_selector = data.get("submit_selector")
    timeout_ms = data.get("timeout_ms", 10000)

    if not isinstance(fields, dict) or len(fields) == 0:
        return _error_response(
            "INVALID_ARGUMENT",
            "fields (non-empty object) is required",
            400,
            {"field": "fields"},
        )

    if submit_selector is not None and (
        not isinstance(submit_selector, str) or not submit_selector.strip()
    ):
        return _error_response(
            "INVALID_ARGUMENT",
            "submit_selector must be a non-empty string when provided",
            400,
            {"field": "submit_selector"},
        )

    try:
        timeout_value = int(timeout_ms)
        if timeout_value <= 0:
            return _error_response(
                "INVALID_ARGUMENT",
                "timeout_ms must be a positive integer",
                400,
                {"field": "timeout_ms"},
            )

        normalized_fields = {str(key): value for key, value in fields.items()}
        result = _browser_controller().form_input(
            fields=normalized_fields,
            clear=clear,
            submit=submit,
            submit_selector=submit_selector.strip()
            if isinstance(submit_selector, str)
            else None,
            timeout_ms=timeout_value,
        )
        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/screenshot", methods=["POST"])
def browser_screenshot():
    data = _body()
    full_page = bool(data.get("full_page", False))
    save_path = data.get("save_path")

    try:
        result = _browser_controller().screenshot(
            full_page=full_page,
            save_path=str(save_path) if save_path else None,
        )

        image_path = result.get("path")
        if isinstance(image_path, str) and image_path:
            with open(image_path, "rb") as f:
                result["base64"] = base64.b64encode(f.read()).decode("utf-8")
            result["media_type"] = "image/png"

        return _ok(result=result)
    except Exception as exc:
        return _exception_response(exc)


@app.route("/api/browser/close", methods=["POST"])
def browser_close():
    try:
        result = _browser_controller().close()
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


@app.route("/api/hotkey", methods=["POST"])
def hotkey():
    data = _body()
    keys = data.get("keys")

    if (
        not isinstance(keys, list)
        or len(keys) == 0
        or any(not isinstance(key, str) or not key.strip() for key in keys)
    ):
        return _error_response(
            "INVALID_ARGUMENT",
            "keys (non-empty string array) is required",
            400,
            {"field": "keys"},
        )

    try:
        normalized_keys = [key.strip() for key in keys]
        result = gui.hotkey(*normalized_keys)
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
        model_width = int(data.get("model_width", MODEL_COORD_WIDTH))
        model_height = int(data.get("model_height", MODEL_COORD_HEIGHT))
        if model_width <= 0 or model_height <= 0:
            return _error_response(
                "INVALID_ARGUMENT",
                "model_width and model_height must be positive integers",
                400,
                {"fields": ["model_width", "model_height"]},
            )

        result = gui.screenshot(
            region=data.get("region"),
            window_title=data.get("window_title"),
            save_path=data.get("save_path"),
        )
        image_path = result.get("path")
        if isinstance(image_path, str) and image_path:
            with Image.open(image_path) as source_image:
                actual_width, actual_height = source_image.size
                resized = source_image.resize(
                    (model_width, model_height),
                    Image.Resampling.LANCZOS,
                )
                # Use JPEG with low quality to keep base64 small for proxy providers
                rgb_image = resized.convert("RGB")
                buffer = io.BytesIO()
                rgb_image.save(buffer, format="JPEG", quality=35, optimize=True)
                result["base64"] = base64.b64encode(buffer.getvalue()).decode("utf-8")

            result["media_type"] = "image/jpeg"
            result["actual_size"] = [actual_width, actual_height]
            result["model_size"] = [model_width, model_height]
            result["scale_x"] = actual_width / model_width
            result["scale_y"] = actual_height / model_height

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

        result = get_ocr().recognize(str(image_path))
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

        result = get_ocr().find_text(str(image_path), str(text))
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

        find_result = get_ocr().find_text(str(image_path), str(text))
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
    print(f"Python automation service starting: http://localhost:{PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=False)
