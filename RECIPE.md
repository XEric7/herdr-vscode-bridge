# VS Code Bridge

Click **Open in VS Code** on the Herdr status bar to open the current folder. Press **Ctrl+Shift+G** to do the same from the keyboard, or Ctrl-click a terminal path to go to a file and its detected line and column.

## What you see

The button sits at the right edge of the shipped Herdr status bar in a 132-pixel block. It uses the current theme's chrome, foreground, and hover colors. The command palette and shortcut show a small progress dialog while opening the folder. The interface defaults to English and offers Simplified Chinese.

## How it behaves

The folder command uses the focused terminal's working directory and falls back to the active space's folder. A file click uses the clicked terminal's machine and directory. On Windows, the matching VS Code window can be restored and shown above Herdr. Failures appear as Herdr notifications.

## Built from

The Windows installer clones the shipped `main` layout and places the `vscode-bridge` button alongside the shipped `workspace-status` block. The mod contains a GPUI button view and a `link_handlers` handler for files. It uses Herdr's focus and machine metadata with `exec` and `hc`, then sends an encoded URI to VS Code. Windows uses PowerShell to launch `Code.exe` and attempt window activation.

## Watch out

WSL and SSH have to be separate Herdr machines for automatic routing. Herdr owns link detection, and only the coordinates it reports can be forwarded. See the [README](README.md) for installation, language, and remote overrides.

## Done when

The button and shortcut open the current folder in the correct local or remote workspace. Ctrl-clicking a recognized path opens the file at the reported line and column. `herdr-app check mods/vscode-bridge` passes.

[简体中文](RECIPE.zh-CN.md)
