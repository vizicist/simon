from __future__ import annotations

import json
import os
import posixpath
import subprocess
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


APP_DIR = Path(__file__).resolve().parent
USER_MP3_DIR = Path.home() / "mp3s"
ACHIEVEMENTS_FILE = APP_DIR / ".hall-of-fame-records.json"
KIOSK_BROWSER_PID_FILE = APP_DIR / ".bop-pad-simon-browser.pid"
SERVER_PID_FILE = APP_DIR / ".bop-pad-simon-server.pid"
BROWSER_PROFILE_DIR = APP_DIR / ".chrome-kiosk-profile"
ACHIEVEMENTS_PATH = "/api/achievements"
QUIT_KIOSK_PATH = "/api/quit-kiosk"
MP3S_PATH = "/mp3s"


def parse_achievements(value: str) -> list[dict]:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []

    if not isinstance(parsed, list):
        return []

    records = []
    for record in parsed:
        if not isinstance(record, dict):
            continue

        steps = record.get("steps")
        elapsed_ms = record.get("elapsedMs")
        if isinstance(steps, int) and isinstance(elapsed_ms, (int, float)):
            records.append(record)

    return records


def sort_achievements(records: list[dict]) -> list[dict]:
    return sorted(records, key=lambda record: (-record["steps"], record["elapsedMs"]))


class BopPadSimonHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def translate_path(self, path):
        url_path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        if url_path == MP3S_PATH or url_path.startswith(f"{MP3S_PATH}/"):
            relative_path = posixpath.normpath(url_path.removeprefix(MP3S_PATH)).lstrip("/")
            parts = [
                part for part in relative_path.split("/")
                if part and part not in (os.curdir, os.pardir)
            ]
            return str(USER_MP3_DIR.joinpath(*parts))

        return super().translate_path(path)

    def do_GET(self):
        if self.path.split("?", 1)[0] == ACHIEVEMENTS_PATH:
            self.send_achievements()
            return

        super().do_GET()

    def do_PUT(self):
        if self.path.split("?", 1)[0] == ACHIEVEMENTS_PATH:
            self.save_achievements()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if self.path.split("?", 1)[0] == QUIT_KIOSK_PATH:
            self.quit_kiosk()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_OPTIONS(self):
        if self.path.split("?", 1)[0] in (ACHIEVEMENTS_PATH, QUIT_KIOSK_PATH):
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_api_headers()
            self.end_headers()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def send_achievements(self):
        if ACHIEVEMENTS_FILE.exists():
            records = parse_achievements(ACHIEVEMENTS_FILE.read_text(encoding="utf-8"))
        else:
            records = []

        self.send_json(records)

    def save_achievements(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0

        body = self.rfile.read(length).decode("utf-8") if length > 0 else "[]"
        records = sort_achievements(parse_achievements(body))[:10]
        ACHIEVEMENTS_FILE.write_text(json.dumps(records, indent=2), encoding="utf-8")
        self.send_json(records)

    def quit_kiosk(self):
        browser_pid = self.read_browser_pid()
        threading.Thread(
            target=stop_app,
            args=(browser_pid, self.server),
            daemon=True,
        ).start()
        self.send_json({"ok": True})

    def read_browser_pid(self):
        try:
            return int(KIOSK_BROWSER_PID_FILE.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            return None

    def send_json(self, value):
        payload = json.dumps(value).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_api_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_api_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def stop_app(browser_pid: int | None, server: ThreadingHTTPServer):
    time.sleep(0.2)
    stop_kiosk_browser(browser_pid)

    try:
        KIOSK_BROWSER_PID_FILE.unlink()
    except OSError:
        pass

    try:
        SERVER_PID_FILE.unlink()
    except OSError:
        pass

    server.shutdown()


def stop_kiosk_browser(browser_pid: int | None):
    if browser_pid is not None:
        subprocess.run(
            ["taskkill", "/PID", str(browser_pid), "/T", "/F"],
            check=False,
            capture_output=True,
        )

    stop_browser_by_profile()


def stop_browser_by_profile():
    profile = str(BROWSER_PROFILE_DIR)
    escaped_profile = profile.replace("'", "''")
    command = (
        f"$profile = '{escaped_profile}'; "
        "Get-CimInstance Win32_Process | "
        "Where-Object { $_.CommandLine -like \"*$profile*\" } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
    )
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command", command],
        check=False,
        capture_output=True,
    )


def main():
    USER_MP3_DIR.mkdir(exist_ok=True)
    SERVER_PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", 80), BopPadSimonHandler)
    try:
        server.serve_forever()
    finally:
        try:
            SERVER_PID_FILE.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    main()
