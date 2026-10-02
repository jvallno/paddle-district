#!/usr/bin/env python3
"""Static dev server for localhost that disables caching, so edits to JS/CSS
show up on a normal reload instead of being served stale from the browser
cache. Usage: python3 serve.py [port]  (default 5173)."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    with ThreadingHTTPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Serving paddle-district on http://localhost:{PORT} (no-cache)")
        httpd.serve_forever()
