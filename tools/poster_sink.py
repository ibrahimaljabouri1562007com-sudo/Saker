"""Receiver for _guide/make-posters.html: saves what the page POSTs into brand/posters/.

  python -I tools/poster_sink.py            (listens on 127.0.0.1:5758, local only)

then open http://localhost:5757/Projects/Saker/_guide/make-posters.html and call run() in its console.
A POST to /<name>.webp carries a data: URL (written as the image bytes); /manifest.json carries the JSON text.
Only those names are accepted; the reply is the number of bytes written. Then: python -I tools/inline_posters.py
"""
import base64, http.server, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'brand', 'posters')
NAME = re.compile(r'^/([a-z]\d{2,4}\.webp|manifest\.json)$')


class Sink(http.server.BaseHTTPRequestHandler):
    def _head(self, code):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()

    def do_OPTIONS(self):
        self._head(204)

    def do_POST(self):
        m = NAME.match(self.path)
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if not m:
            self._head(400); self.wfile.write(b'bad name'); return
        name = m.group(1)
        if name.endswith('.webp'):
            text = body.decode('ascii')
            if not text.startswith('data:image/webp;base64,'):
                self._head(400); self.wfile.write(b'not a webp data URL'); return
            data = base64.b64decode(text.split(',', 1)[1])
        else:
            data = body
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(data)
        print(f'{name}: {len(data):,} bytes')
        self._head(200); self.wfile.write(str(len(data)).encode())

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print('poster sink on http://127.0.0.1:5758 ->', OUT)
    http.server.ThreadingHTTPServer(('127.0.0.1', 5758), Sink).serve_forever()
