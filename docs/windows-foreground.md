# Windows 上打开文件后，VS Code 窗口仍在后台

## 现象和复现

在 Windows 上打开一个 VS Code 工作区，再将它最小化。在 Herdr 中进入该工作区目录，让终端输出 `./README.md:12:1`，然后按住 Ctrl 点击这个路径。问题出现时，文件已经在原工作区打开，但 VS Code 仍被 Herdr 挡住。

验证时分别检查三个结果：文件和光标位置、窗口是否显示在 Herdr 前面，以及键盘输入落在哪个窗口。

## 原因

Herdr Desktop 0.1.18 的 Mod 可以收到终端点击事件。本地 `herdr.exec()` 通过后台子进程运行命令。Mod 的 GUI 接口 `open_url()` 只接受 HTTP 和 HTTPS，因此无法直接从前台 GUI 交出 `vscode:` 链接。[Herdr 本地执行源码](https://github.com/herdrdev/herdr-app/blob/v0.1.18/src/mods.rs#L822-L833)

Windows 分别处理窗口的显示顺序和键盘焦点。实际点击的诊断确认，Herdr 当时是前台窗口，Mod 找到了正在运行的 VS Code 进程，但后台启动进程调用 `AllowSetForegroundWindow` 返回了失败。VS Code 仍然收到了文件打开请求。[Windows 前台权限规则](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-allowsetforegroundwindow#remarks)

## 当前处理方式

1. 用 `--file-uri` 启动 VS Code，有坐标时加上 `--goto`。VS Code 根据 URI 和远程 authority 自行选择工作区。启动请求发出后，Mod 并行准备 Windows 窗口操作。[启动代码](../mods/vscode-bridge/bridge.js)
2. 如果 Herdr 仍在前台，而且在匹配的 VS Code 进程中只有一个窗口的标题以目标文件名开头，就恢复该窗口并尝试激活它。用户切到其他窗口时，Mod 停止尝试。
3. 如果 Windows 拒绝激活，Mod 用 `SetWindowPos` 短暂提高目标窗口的显示层级，再立即恢复普通层级。这能让 VS Code 出现在 Herdr 前面，键盘焦点可能仍由 Herdr 持有。[窗口处理代码](../mods/vscode-bridge/windows-focus.js) · [Windows 窗口层级 API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos)

本机通过实际 Ctrl+点击复测，VS Code 出现在 Herdr 前面，键盘焦点仍留在 Herdr。一次测量中，从发出启动请求到窗口显示在前面约 **340 毫秒**。该时间从启动请求开始计量，远程识别和连接耗时另计。

## 已知边界

- 窗口匹配依赖文件名和编辑器标题。自定义标题可能匹配不到。同名文件在多个工作区中同时打开时，应检查匹配是否仍能指向正确的工作区。
- 如果 Herdr 将来提供由前台进程处理的编辑器打开接口，可以在点击时由 Herdr 转交激活权限，让 VS Code 自己选择并恢复窗口，从而省去标题匹配和显示层级补救。
