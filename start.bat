@echo off
cd /d "%~dp0"
rem 用 _tools/serve_nocache.py 而不是 `python -m http.server`:
rem 后者不发 Cache-Control, 浏览器会缓存 js/css, 改了代码刷新却看不到效果。
python "_tools\serve_nocache.py" 8123
if errorlevel 1 (
  echo.
  echo [warn] serve_nocache.py 启动失败, 回退到 python -m http.server
  python -m http.server 8123
)
echo.
echo Open http://127.0.0.1:8123/ in a browser.
pause
