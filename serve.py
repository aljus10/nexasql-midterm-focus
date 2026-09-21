from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

PORT = 8080
ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

print(f"NexaSQL Midterm Focus: http://localhost:{PORT}")
print("Press Ctrl+C to stop the server.")
ThreadingHTTPServer(("localhost", PORT), NoCacheHandler).serve_forever()
