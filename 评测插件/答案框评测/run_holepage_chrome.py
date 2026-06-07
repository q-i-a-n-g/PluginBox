#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import sys
from typing import Dict, Any

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


def _click_tab(page, tab_text: str) -> None:
    # Prefer ARIA role=tab, fallback to text.
    tab = page.get_by_role("tab", name=tab_text).first
    if tab.count() > 0:
        tab.click()
        return
    fallback = page.get_by_text(tab_text, exact=True).first
    fallback.click()


def _scroll_to_top(page) -> None:
    page.evaluate(
        "(() => { const el = document.scrollingElement || document.documentElement; el.scrollTop = 0; })()"
    )


def _scroll_down(page) -> None:
    page.evaluate(
        "(() => { const el = document.scrollingElement || document.documentElement; el.scrollBy(0, Math.floor(window.innerHeight * 0.85)); })()"
    )


def _near_bottom(page) -> bool:
    return bool(
        page.evaluate(
            "(() => { const el = document.scrollingElement || document.documentElement; return el.scrollTop + window.innerHeight >= el.scrollHeight - 10; })()"
        )
    )


def _click_visible_dui_labels(page) -> int:
    # The UI uses <label><input type="radio">对</label> patterns.
    return int(
        page.evaluate(
            r"""
(() => {
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < (window.innerHeight || document.documentElement.clientHeight);
  }
  const labels = Array.from(document.querySelectorAll('label'));
  let changed = 0;
  for (const label of labels) {
    if (!isVisible(label)) continue;
    const text = (label.innerText || '').trim();
    if (text !== '对') continue;
    const input = label.querySelector('input[type="radio"]');
    if (!input) continue;
    if (input.checked) continue;
    label.click();
    changed++;
  }
  return changed;
})()
""".strip()
        )
    )


def process_tab_click_all_dui(page, tab_text: str, max_scrolls: int = 320) -> int:
    _click_tab(page, tab_text)
    page.wait_for_timeout(200)
    _scroll_to_top(page)
    page.wait_for_timeout(100)

    total = 0
    stable_rounds = 0
    for _ in range(max_scrolls):
        n = _click_visible_dui_labels(page)
        total += n
        stable_rounds = stable_rounds + 1 if n == 0 else 0
        _scroll_down(page)
        page.wait_for_timeout(120)
        if _near_bottom(page) and stable_rounds >= 3:
            break

    _scroll_to_top(page)
    page.wait_for_timeout(100)
    return total


def process_page(page, url: str) -> Dict[str, Any]:
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(600)

    ans_changed = process_tab_click_all_dui(page, "答案框")
    q_changed = process_tab_click_all_dui(page, "题目框")

    # Only click "仅保存" once per page, after both tabs are processed.
    page.get_by_role("button", name="仅保存").click()
    page.wait_for_timeout(700)

    return {"url": url, "answerBoxChanged": ans_changed, "questionBoxChanged": q_changed, "saved": True}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--holepage-id", required=True, help="holepage id, e.g. 65852/469080")
    parser.add_argument("--pages", type=int, default=8)
    parser.add_argument("--base", default="https://metis-match--mapi.online-venv.yuanfudao.com/evaluation/stage/")
    parser.add_argument(
        "--cdp",
        default="",
        help="Connect to an existing Chrome via CDP, e.g. http://127.0.0.1:9222 (recommended on macOS).",
    )
    parser.add_argument("--headless", action="store_true", help="run headless (default: headed)")
    args = parser.parse_args(argv)

    holepage_id = args.holepage_id.strip().strip("/")
    total_pages = args.pages
    base = args.base.rstrip("/") + "/"

    with sync_playwright() as p:
        # Prefer connecting to a user-launched Chrome (more stable on some macOS setups).
        if args.cdp:
            browser = p.chromium.connect_over_cdp(args.cdp)
            context = browser.contexts[0] if browser.contexts else browser.new_context()
        else:
            # Launch local Google Chrome with --no-sandbox as requested.
            launch_args = [
                "--no-sandbox",
                "--disable-crash-reporter",
                "--disable-breakpad",
            ]
            browser = p.chromium.launch(
                channel="chrome",
                headless=bool(args.headless),
                args=launch_args,
            )
            context = browser.new_context()
        page = context.new_page()

        results = []
        for page_no in range(1, total_pages + 1):
            url = f"{base}#/admin/evaluation/holepage/{holepage_id}/{page_no}"
            try:
                res = process_page(page, url)
            except PlaywrightTimeoutError as e:
                res = {"url": url, "error": f"timeout: {e}"}
            results.append({"page": page_no, **res})
            print(results[-1], flush=True)

        # Keep the browser open a bit so the user can see the final state if headed.
        page.wait_for_timeout(500)
        try:
            context.close()
        finally:
            browser.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
