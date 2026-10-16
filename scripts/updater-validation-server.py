"""HTTPS loopback fixture. No credentials or remote traffic; never a production server."""
import http.server, json, pathlib, ssl, sys

root = pathlib.Path(sys.argv[1]).resolve()
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self):
        host = self.headers.get('Host', '').split(':')[0]
        status = 503 if host == 'ghfast.top' else 200
        artifact = root / 'target' / self.path.rsplit('/', 1)[-1]
        path = root / 'latest.json' if self.path.endswith('latest.json') else artifact
        if not path.is_file(): status = 404
        body = path.read_bytes() if status == 200 else b'fixture fallback'
        if status == 200 and path.name == 'latest.json':
            manifest = json.loads(body)
            if (root / 'no-update').exists(): manifest['version'] = '99.0.1'
            if (root / 'wrong-version').exists(): manifest['version'] = '99.0.3'
            body = json.dumps(manifest).encode()
        if (root / 'tamper').exists() and path != root / 'latest.json' and status == 200: body = b'tampered fixture'
        with (root / 'requests.jsonl').open('a') as log:
            log.write(json.dumps({'host': host, 'resource': 'manifest' if path.name == 'latest.json' else 'artifact', 'status': status, 'bytes': len(body)}) + '\n')
        self.send_response(status)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Content-Type', 'application/json' if path.name == 'latest.json' else 'application/octet-stream')
        self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 443), Handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(root / 'https.pem', root / 'https.key')
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
