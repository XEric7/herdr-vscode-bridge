import { appHome, exec, hc, home, notify, readTextFile, window as appWindow } from "herdr";
import { filePath, sshAuthority, targetUri, wslAuthority } from "./paths.js";

const identityFiles = ["/proc/sys/kernel/random/boot_id", "/etc/machine-id"];

/** Reads a verified boot and machine ID pair from the result of cat, or null. */
function linuxIdentity(result) {
  const id = result?.stdout.trim();
  return result?.code === 0 && /^[a-f\d-]{36}\s+[a-f\d]{32}$/i.test(id) ? id : null;
}

/** Finds a uniquely matching running local WSL distribution for the Herdr machine. */
async function localWslDistro(machine) {
  const [remote, running] = await Promise.all([
    exec("cat", identityFiles, { on: machine, timeout: 4000 }).catch(() => null),
    exec("wsl.exe", ["--list", "--running", "--quiet"], { timeout: 4000 }).catch(() => null),
  ]);
  const identity = linuxIdentity(remote);
  if (!identity || running?.code !== 0) return null;
  // WSL list output on Windows may arrive as UTF-16 with NULs between ASCII characters.
  const names = running.stdout.replaceAll("\0", "").replace(/^\uFEFF/, "").trim().split(/\r?\n/)
    .map((name) => name.trim()).filter((name) => name && !name.startsWith("-"));
  const matches = await Promise.all(names.map(async (name) => {
    const candidate = await exec("wsl.exe", ["--distribution", name, "--exec", "cat", ...identityFiles],
      { timeout: 4000 }).catch(() => null);
    return linuxIdentity(candidate) === identity ? name : null;
  }));
  const found = matches.filter(Boolean);
  return found.length === 1 ? found[0] : null;
}

/** Resolves the VS Code authority and path style for a Herdr machine and source path. */
async function destination(machine, path, platform) {
  const windows = machine ? /^(?:\/?[a-z]:[/\\]|\\\\)/i.test(path ?? "") : platform === "windows";
  if (!machine) return { windows, authority: null };

  const raw = await readTextFile(`${appHome()}/mods/vscode-bridge/authorities.json`).catch(() => null);
  const overrides = raw === null ? {} : JSON.parse(raw);
  const override = Object.hasOwn(overrides, machine) ? overrides[machine] : undefined;
  if (override !== undefined) {
    if (typeof override?.wsl === "string" && override.wsl.trim() && platform === "windows") {
      return { windows: false, authority: wslAuthority(override.wsl) };
    }
    if (typeof override?.ssh === "string") return { windows, authority: sshAuthority(override.ssh) };
    throw new Error(`请检查 authorities.json 中 ${machine} 的 wsl 或 ssh 配置。`);
  }

  if (platform === "windows" && !windows) {
    const distro = await localWslDistro(machine);
    if (distro) return { windows: false, authority: wslAuthority(distro) };
  }
  const result = await hc(["machine", "ls", "--json"]);
  if (result.code !== 0) throw new Error("Herdr 无法读取机器列表。");
  const entry = JSON.parse(result.stdout).machines?.find((item) => item.name === machine);
  if (!entry?.target || entry.via) {
    throw new Error(`无法自动识别 ${machine}，请在 authorities.json 中配置 wsl 或 ssh。`);
  }
  return { windows, authority: sshAuthority(entry.target) };
}

/** Builds the VS Code protocol fallback for a CLI URI and optional file coordinates. */
function protocolUrl(uri, folder, hasLine) {
  if (uri.startsWith("vscode-remote://")) {
    return uri.replace("vscode-remote://", "vscode://vscode-remote/") + (!folder && !hasLine ? ":1:1" : "");
  }
  // The local protocol represents a local filesystem path, not a UNC URI.
  return uri.startsWith("file:///") ? uri.replace("file://", "vscode://file") : null;
}

/** Opens a folder or file with an explicit CLI URI, leaving window selection to VS Code. */
async function launch(uri, folder, hasLine, platform) {
  const args = [folder ? "--folder-uri" : "--file-uri", uri];
  if (hasLine) args.unshift("--goto");
  const url = protocolUrl(uri, folder, hasLine);

  let result;
  if (platform === "windows") {
    // Only fixed flags and a percent-encoded URI can enter this PowerShell string.
    // Start Code.exe directly so paths never pass through the code.cmd batch shim.
    if (!/^[a-z\d:/.%_~+\-]+$/i.test(uri)) throw new Error("VS Code URI 包含无效字符。");
    const script = `
$ErrorActionPreference = 'Stop'
$exe = (Get-Command Code.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $exe) {
  $shim = (Get-Command code.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  $candidates = @(
    if ($shim) { Join-Path (Split-Path (Split-Path $shim)) 'Code.exe' }
    Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'
    Join-Path $env:ProgramFiles 'Microsoft VS Code/Code.exe'
    $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($programFilesX86) { Join-Path $programFilesX86 'Microsoft VS Code/Code.exe' }
  )
  $exe = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if ($exe) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE, Env:VSCODE_IPC_HOOK_CLI -ErrorAction SilentlyContinue
  Start-Process -FilePath $exe -ArgumentList '${args.join(" ")}'
} else {
  ${url ? `Start-Process -FilePath '${url}'` : "throw 'Code.exe was not found. Add the VS Code installation directory to PATH.'"}
}`;
    result = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 8000 });
  } else {
    result = await exec("code", args, { timeout: 6000 }).catch(() => null);
    if (result?.code !== 0 && url) {
      result = await exec(platform === "macos" ? "open" : "xdg-open", [url], { timeout: 4000 });
    }
  }
  if (result?.code !== 0) throw new Error(result?.stderr.trim() || "VS Code 启动失败。");
}

/** Opens the focused terminal's cwd or the fallback space folder on its source machine. */
export async function openFolder(path, machine) {
  if (!path) throw new Error("当前终端和空间都没有可用的工作目录。");
  const platform = appWindow()?.platform;
  const target = await destination(machine, path, platform);
  await launch(targetUri(path, target), true, false, platform);
}

/** Opens the clicked file on its source machine, preserving the detected line and column. */
export async function openFile(link, source) {
  const platform = appWindow()?.platform;
  const target = await destination(source.machine, source.cwd || link.path || link.raw, platform);
  let userHome;
  if (!link.path && link.raw.startsWith("~/")) {
    if (!source.machine) userHome = home();
    else {
      const result = await exec("printenv", ["HOME"], { on: source.machine, timeout: 3000 });
      if (result.code === 0) userHome = result.stdout.trim();
    }
  }
  const path = filePath(link, source.cwd, userHome, target.windows);
  await launch(targetUri(path, target, link.line, link.column), false, Boolean(link.line), platform);
}

/** Shows the reason a launch failed in Herdr's notification area. */
export function showError(error) {
  notify({ title: "无法在 VS Code 中打开", body: error?.message ?? String(error), level: "error" });
}
