## 本次更新

### 工程与资源清理

- 移除 node_modules（约 187MB），项目不再依赖 npm 运行时库。
- 浏览器依赖改用 Import Maps：`three` / `cannon-es` 直接映射到 `vendor/` 下的本地 ESM 构建，后续模块可直接 `import`。
- 清理历史测试截图、探针输出与日志（outputs、_tools 下的图片/文本）。
- 保留一张实机标题页截图作为封面：`logo.png`（PNG，1760×344）。

游戏内容与上一版一致。
