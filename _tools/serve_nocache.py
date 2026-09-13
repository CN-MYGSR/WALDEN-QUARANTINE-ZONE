#!/usr/bin/env python3
# 本地开发服务器 (禁用缓存)
# 为什么需要它: `python -m http.server` 只发 Last-Modified, 不发 Cache-Control,
# 浏览器会按"启发式缓存"把 js/css 缓存起来 —— 改了代码却看不到, 只能手动强刷。
# 这里给每个响应都加上 no-store, 保证每次刷新都拿到磁盘上的最新文件。
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # _tools/ 的上一层 = 项目根目录
os.chdir(ROOT)


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # 静音, 免得刷屏


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
    print('serving %s at http://127.0.0.1:%d/  (no-cache)' % (ROOT, PORT))
    print('press Ctrl+C to stop')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')
