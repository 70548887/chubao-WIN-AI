"""
Browser automation module based on Playwright.
"""

import os
import re
from datetime import datetime
from typing import Any, Dict, Optional


class BrowserController:
    """Playwright-based browser controller."""

    def __init__(self):
        self.screenshot_dir = './screenshots'
        self._sync_playwright = None
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self._import_error: Optional[Exception] = None

        try:
            from playwright.sync_api import sync_playwright  # type: ignore

            self._sync_playwright = sync_playwright
        except Exception as exc:
            self._import_error = exc

    def health_probe(self) -> Dict[str, Any]:
        """Return dependency/runtime probe for health endpoint."""
        if self._sync_playwright is None:
            return {
                'state': 'degraded',
                'detail': {
                    'available': False,
                    'reason': f'playwright unavailable: {self._import_error}',
                },
            }

        return {
            'state': 'ok',
            'detail': {
                'available': True,
                'launched': self._browser is not None and self._page is not None,
                'url': self._page.url if self._page is not None else None,
            },
        }

    def launch(
        self,
        headless: bool = False,
        width: int = 1280,
        height: int = 720,
    ) -> Dict[str, Any]:
        """Launch browser and create a fresh page context."""
        self._ensure_available()

        safe_width = max(320, int(width))
        safe_height = max(240, int(height))

        if self._playwright is None:
            self._playwright = self._sync_playwright().start()

        if self._browser is None:
            self._browser = self._playwright.chromium.launch(headless=bool(headless))

        if self._context is not None:
            self._context.close()
        self._context = self._browser.new_context(
            viewport={'width': safe_width, 'height': safe_height}
        )
        self._page = self._context.new_page()

        return {
            'action': 'browser_launch',
            'headless': bool(headless),
            'viewport': [safe_width, safe_height],
        }

    def navigate(
        self,
        url: str,
        wait_until: str = 'domcontentloaded',
        timeout_ms: int = 30000,
    ) -> Dict[str, Any]:
        """Navigate to URL."""
        page = self._ensure_page()
        normalized_url = self._normalize_url(url)
        response = page.goto(
            normalized_url,
            wait_until=wait_until,
            timeout=max(1000, int(timeout_ms)),
        )

        return {
            'action': 'browser_navigate',
            'url': page.url,
            'title': page.title(),
            'status': response.status if response is not None else None,
        }

    def click(self, selector: str, timeout_ms: int = 10000) -> Dict[str, Any]:
        """Click DOM element."""
        page = self._ensure_page()
        page.click(selector, timeout=max(1000, int(timeout_ms)))
        return {'action': 'browser_click', 'selector': selector, 'url': page.url}

    def type_text(
        self,
        selector: str,
        text: str,
        clear: bool = False,
        timeout_ms: int = 10000,
    ) -> Dict[str, Any]:
        """Type text into DOM element."""
        page = self._ensure_page()
        timeout = max(1000, int(timeout_ms))

        if clear:
            page.fill(selector, text, timeout=timeout)
        else:
            page.click(selector, timeout=timeout)
            page.type(selector, text, timeout=timeout)

        return {
            'action': 'browser_type',
            'selector': selector,
            'text_length': len(text),
            'url': page.url,
        }

    def press(self, key: str) -> Dict[str, Any]:
        """Send keyboard key to current page."""
        page = self._ensure_page()
        page.keyboard.press(key)
        return {'action': 'browser_press', 'key': key, 'url': page.url}

    def scroll(self, delta_x: int = 0, delta_y: int = 600) -> Dict[str, Any]:
        """Scroll page using mouse wheel deltas."""
        page = self._ensure_page()
        page.mouse.wheel(int(delta_x), int(delta_y))
        return {
            'action': 'browser_scroll',
            'delta_x': int(delta_x),
            'delta_y': int(delta_y),
            'url': page.url,
        }

    def screenshot(
        self,
        full_page: bool = False,
        save_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Capture browser page screenshot."""
        page = self._ensure_page()
        os.makedirs(self.screenshot_dir, exist_ok=True)

        if not save_path:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            save_path = os.path.join(self.screenshot_dir, f'browser_{timestamp}.png')

        page.screenshot(path=save_path, full_page=bool(full_page))
        viewport = page.viewport_size or {}

        return {
            'action': 'browser_screenshot',
            'path': save_path,
            'full_page': bool(full_page),
            'size': [viewport.get('width'), viewport.get('height')],
            'url': page.url,
        }

    def read_page(
        self,
        include_html: bool = True,
        include_forms: bool = True,
        max_html_chars: int = 40000,
    ) -> Dict[str, Any]:
        """Read current page structure for downstream reasoning."""
        page = self._ensure_page()
        safe_max_html_chars = max(1000, int(max_html_chars))

        html = ''
        html_length = 0
        if include_html:
            full_html = page.content()
            html_length = len(full_html)
            html = full_html[:safe_max_html_chars]

        text = page.evaluate(
            "() => document.body ? (document.body.innerText || '') : ''"
        )
        normalized_text = self._normalize_whitespace(text)
        text_excerpt = normalized_text[:8000]

        forms = []
        if include_forms:
            forms = page.evaluate(
                """() => {
                    const forms = Array.from(document.forms || []);
                    return forms.map((form, formIndex) => {
                        const elements = Array.from(form.elements || []);
                        const fields = elements.map((el, fieldIndex) => {
                            const tag = (el.tagName || '').toLowerCase();
                            const inputType = tag === 'input'
                                ? ((el.getAttribute('type') || 'text').toLowerCase())
                                : tag;
                            return {
                                index: fieldIndex,
                                tag,
                                type: inputType,
                                name: el.getAttribute('name') || null,
                                id: el.id || null,
                                placeholder: el.getAttribute('placeholder') || null,
                            };
                        });

                        return {
                            index: formIndex,
                            id: form.id || null,
                            name: form.getAttribute('name') || null,
                            action: form.getAttribute('action') || null,
                            method: (form.getAttribute('method') || 'get').toLowerCase(),
                            fieldCount: fields.length,
                            fields,
                        };
                    });
                }"""
            )

        return {
            'action': 'browser_read_page',
            'url': page.url,
            'title': page.title(),
            'html': html,
            'html_length': html_length,
            'html_truncated': bool(include_html and html_length > len(html)),
            'text_excerpt': text_excerpt,
            'text_length': len(normalized_text),
            'forms': forms,
            'form_count': len(forms),
        }

    def get_text(
        self,
        selector: Optional[str] = None,
        max_chars: int = 8000,
        normalize_whitespace: bool = True,
        timeout_ms: int = 10000,
    ) -> Dict[str, Any]:
        """Get visible text from page or specific element."""
        page = self._ensure_page()
        safe_max_chars = max(200, int(max_chars))
        timeout = max(1000, int(timeout_ms))

        if selector:
            locator = page.locator(selector).first
            text = locator.inner_text(timeout=timeout)
        else:
            text = page.evaluate(
                "() => document.body ? (document.body.innerText || '') : ''"
            )

        normalized_text = (
            self._normalize_whitespace(text)
            if normalize_whitespace
            else (text or '')
        )
        clipped_text = normalized_text[:safe_max_chars]

        return {
            'action': 'browser_get_text',
            'url': page.url,
            'selector': selector,
            'text': clipped_text,
            'text_length': len(normalized_text),
            'truncated': len(normalized_text) > len(clipped_text),
        }

    def form_input(
        self,
        fields: Dict[str, Any],
        clear: bool = True,
        submit: bool = False,
        submit_selector: Optional[str] = None,
        timeout_ms: int = 10000,
    ) -> Dict[str, Any]:
        """Fill form-like inputs by CSS selector."""
        page = self._ensure_page()
        timeout = max(1000, int(timeout_ms))

        if not fields:
            raise ValueError('fields is required')

        applied = []
        for selector, value in fields.items():
            if not isinstance(selector, str) or not selector.strip():
                raise ValueError('all field selectors must be non-empty strings')
            safe_selector = selector.strip()

            locator = page.locator(safe_selector).first
            locator.wait_for(state='attached', timeout=timeout)

            tag_name = (
                locator.evaluate("el => (el.tagName || '').toLowerCase()")
                or ''
            )

            if tag_name == 'select':
                locator.select_option(str(value), timeout=timeout)
            elif tag_name == 'input':
                input_type = (locator.get_attribute('type') or 'text').lower()
                if input_type in {'checkbox', 'radio'}:
                    desired = bool(value)
                    if input_type == 'radio' and not desired:
                        continue
                    if desired:
                        locator.check(timeout=timeout)
                    else:
                        locator.uncheck(timeout=timeout)
                else:
                    if clear:
                        locator.fill(str(value), timeout=timeout)
                    else:
                        locator.click(timeout=timeout)
                        locator.type(str(value), timeout=timeout)
            elif tag_name == 'textarea':
                if clear:
                    locator.fill(str(value), timeout=timeout)
                else:
                    locator.click(timeout=timeout)
                    locator.type(str(value), timeout=timeout)
            else:
                locator.fill(str(value), timeout=timeout)

            applied.append(
                {
                    'selector': safe_selector,
                    'value_preview': self._preview_value(value),
                }
            )

        submitted = False
        if submit_selector:
            page.click(submit_selector, timeout=timeout)
            submitted = True
        elif submit:
            page.keyboard.press('Enter')
            submitted = True

        return {
            'action': 'browser_form_input',
            'url': page.url,
            'applied_count': len(applied),
            'applied': applied,
            'submitted': submitted,
        }

    def close(self) -> Dict[str, Any]:
        """Close browser and release playwright resources."""
        if self._context is not None:
            self._context.close()
            self._context = None
            self._page = None

        if self._browser is not None:
            self._browser.close()
            self._browser = None

        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None

        return {'action': 'browser_close', 'closed': True}

    def _ensure_available(self) -> None:
        if self._sync_playwright is None:
            raise RuntimeError(f'browser dependency unavailable: {self._import_error}')

    def _ensure_page(self):
        self._ensure_available()
        if self._page is None:
            self.launch()
        return self._page

    def _normalize_url(self, url: str) -> str:
        normalized = url.strip()
        if not normalized:
            raise ValueError('url is required')
        if '://' not in normalized:
            normalized = f'https://{normalized}'
        return normalized

    def _normalize_whitespace(self, text: Any) -> str:
        value = text if isinstance(text, str) else str(text or '')
        return re.sub(r'\s+', ' ', value).strip()

    def _preview_value(self, value: Any, max_chars: int = 80) -> str:
        rendered = value if isinstance(value, str) else str(value)
        return rendered if len(rendered) <= max_chars else f'{rendered[:max_chars]}...'
