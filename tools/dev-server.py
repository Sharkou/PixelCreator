"""Serves a directory over HTTP, and refuses to be cached.

`dev-server.sh` runs `python -m http.server`, which sends `Last-Modified` and no
`Cache-Control`. A browser is then free to apply heuristic freshness — and it does, to ES
modules: editing a file and reloading serves the version from before the edit, silently,
for as long as the heuristic lasts. That is not a rare annoyance during a UI pass; it is a
whole afternoon spent debugging code that is not running.

So this one says `no-store` on every response. It is otherwise the same server, with the
same arguments, and it is for development only — nothing here is meant to face a network.

Usage: python tools/dev-server.py [port] [root]
  port   default: 8100
  root   default: the current directory
"""
import functools
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    """The stock static handler, with caching turned off."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # One line per request drowns out whatever the developer is watching for.
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8100
    root = sys.argv[2] if len(sys.argv) > 2 else '.'

    handler = functools.partial(Handler, directory=root)
    print(f'serving {root} on http://localhost:{port} (no-store)')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
