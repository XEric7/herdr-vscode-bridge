# Herdr VS Code Bridge

在 Herdr Desktop 中点击 **用 VS Code 打开** 或按 **Ctrl+Shift+G**，即可打开焦点终端的工作目录。终端没有报告目录时，使用当前空间的目录。也可以从命令面板运行 **Open in VS Code**。

**Ctrl+点击**终端中的文件链接会在 VS Code 中打开文件，并保留 Herdr 识别到的行号和列号，例如 `./src/main.js:12:4`。macOS 使用 Cmd+点击。

## Windows 安装

需要支持 `link_handlers` 的 Herdr Desktop（已验证 0.1.18）和本机 VS Code。使用远程环境时，在本机 VS Code 安装 Microsoft 的 WSL 或 Remote - SSH 扩展。

先打开 Herdr，然后在仓库目录运行：

```powershell
.\Install.ps1 -Activate
```

如果 `herdr-app` 不在 PATH，传入 `-HerdrApp 'C:\path\to\herdr-app.exe'`。安装脚本从已安装版本的官方 `layouts/main.json` 创建 `main-vscode-bridge`，加入底部按钮和文件链接处理器，并给新布局单独绑定快捷键。去掉 `-Activate` 可以稍后在 Settings 中切换。

## 手动安装或更新

1. 将 `mods/vscode-bridge` 复制到 Herdr 应用目录的 `mods/`。应用目录默认为 `~/.config/herdr-app`，也可以用 `HERDR_APP_HOME` 指定。更新时覆盖 Mod 的源码文件，保留自己的 `authorities.json`。
2. 用命令面板复制官方 `main` 布局为 `main-vscode-bridge`，在新布局的根对象中添加 `"link_handlers": ["vscode-bridge"]`。如果已有该字段，将 Mod 名加入列表。
3. 在新布局的列或行内加入按钮块。以下示例适合放在列的底部。

   ```json
   {
     "id": "vscode-bridge",
     "type": "block",
     "size": { "px": 28 },
     "content": { "mod": "vscode-bridge" }
   }
   ```

4. 在 `keys.json` 中合并快捷键，然后切换到新布局。macOS 可用 `cmd-shift-g`。

   ```json
   {
     "layout:main-vscode-bridge": {
       "ctrl-shift-g": "mod.open:vscode-bridge"
     }
   }
   ```

5. 运行 `herdr-app check <应用目录>/mods/vscode-bridge`，并通过 `herdr-app status` 查看运行时错误。

## 机器与窗口

| 终端来源 | VS Code 目标 |
| --- | --- |
| 本机 Windows | 本地文件系统 |
| 同一台 Windows 上的 WSL2 | 通过运行中的发行版与终端机器核对 Linux 启动 ID 和机器 ID，唯一匹配时使用原生 `wsl+` authority |
| Herdr 的 Remote SSH 机器 | 使用 Herdr 登记的 SSH 连接目标生成 `ssh-remote+` authority |

请把 WSL2 或 SSH 作为独立的 Herdr 机器连接。直接在本地终端里输入 `wsl` 或 `ssh` 后，Herdr 的 Mod API 可能仍把终端标记为本机。

如果自动匹配不到 WSL、使用了自定义 `--via`，或 VS Code 需要使用另一个 SSH 别名，可以在安装后的 Mod 目录创建 `authorities.json`。键是 Herdr 机器名，值选择 `wsl` 或 `ssh`。SSH 别名需在 VS Code 的 SSH 配置中可用。

```json
{
  "my-wsl-machine": { "wsl": "Ubuntu" },
  "my-ssh-machine": { "ssh": "my-server" }
}
```

文件打开交由 VS Code 按 authority 和路径选择工作区。已有匹配工作区时可复用，结果也受 VS Code 的窗口设置影响。路径以编码后的 URI 交给 VS Code，支持空格和 Unicode。终端能否识别链接由 Herdr 决定。带空格的路径如果无法识别为整段，可由输出程序用 OSC 8 生成单个 `file:` 链接。Herdr 0.1.18 的 `file:` 链接不提供行列号，也跳过部分裸文件名和反斜杠文本路径。

Mod 仅在 Herdr 界面内响应用户操作。它不修改 Agent Prompt，不安装 Skill，没有常驻进程和额外运行时依赖。

## 开发验证

有 Node.js 22.7 或更新版本时，可以运行 `node --test tests/paths.test.mjs`，检查路径编码、诊断坐标和远程 authority。再用 `herdr-app check mods/vscode-bridge` 检查 Mod 清单和初始视图。

- [Herdr Mod 开发指南](https://github.com/herdrdev/herdr-app/blob/v0.1.18/defaults/AGENTS.md)
- [VS Code CLI](https://code.visualstudio.com/docs/configure/command-line)
- [VS Code Remote SSH URI](https://code.visualstudio.com/docs/remote/troubleshooting#_connect-to-a-remote-host-from-the-terminal)
