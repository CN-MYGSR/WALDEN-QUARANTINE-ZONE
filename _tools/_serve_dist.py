#!/usr/bin/env python3
# 只为"发布前验收"服务的临时静态服务器: 根目录固定为 dist/ (构建产物), 禁用缓存。
# 不要在 dist/ 里放任何脚本 —— dist 会被整包上传, 必须保持干净。
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(os.path.dirname(HERE), 'dist')
os.chdir(ROOT)


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
    print('serving %s at http://127.0.0.1:%d/  (no-cache)' % (ROOT, PORT))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
