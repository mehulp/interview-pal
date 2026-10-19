#!/usr/bin/env python3
"""A tiny static file server for InterviewPal (Python standard library only).

Usage: devserver.py [PORT]      (default 8000)

- Serves the project folder (the parent of this scripts/ folder).
- Listens on 127.0.0.1 only, so other computers on the network cannot reach it.
- Sends "Cache-Control: no-store", so a normal refresh always shows the latest files.
- Sends correct content types for JavaScript modules, CSS, JSON, images and video.
"""
import functools
import signal
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
ROOT = Path(__file__).resolve().parent.parent

# Set explicitly, because the system's own list of types differs between computers.
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
        if not 1 <= port <= 65535:
            raise ValueError
    except ValueError:
        print(f"Not a valid port: {sys.argv[1]}", file=sys.stderr)
        return 2

    handler = functools.partial(Handler, directory=str(ROOT))
    try:
        server = ThreadingHTTPServer((HOST, port), handler)
    except OSError as err:
        print(f"Could not listen on {HOST}:{port}: {err.strerror}", file=sys.stderr)
        return 3

    # A "stop" request (SIGTERM) should end quietly, like Ctrl+C.
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    print(f"Serving {ROOT} at http://localhost:{port}/ (127.0.0.1 only)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
