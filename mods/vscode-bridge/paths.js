/** Encodes one path or authority segment using only URI-safe characters. */
function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Builds a Remote SSH authority for the OpenSSH target, including user and port. */
export function sshAuthority(target) {
  if (!target || /^-|[\s\x00-\x1f]/u.test(target)) {
    throw new Error("无效的 SSH 目标，请在 authorities.json 中配置 SSH Host。");
  }
  if (/^[a-z0-9._-]+$/.test(target)) return `ssh-remote+${target}`;
  const hex = encodeURIComponent(JSON.stringify({ hostName: target }))
    .replace(/%([0-9A-F]{2})|([\s\S])/g, (_, byte, char) =>
      (byte ?? char.charCodeAt(0).toString(16).padStart(2, "0")).toLowerCase());
  return `ssh-remote+${hex}`;
}

/** Builds the native WSL authority for a local Windows distribution name. */
export function wslAuthority(distro) {
  return `wsl+${encode(distro)}`;
}

/** Resolves a Herdr file link against the clicked terminal's cwd and machine home. */
export function filePath(link, cwd, userHome, windows) {
  if (link.path) return link.path;
  let path = link.raw;
  if (/^file:/i.test(path)) {
    const uri = /^file:\/\/(?<host>[^/?#]*)(?<path>\/[^?#]*)(?:[?#].*)?$/i.exec(path);
    if (!uri) throw new Error("无法解析此文件 URI。");
    const host = uri.groups.host;
    path = decodeURIComponent(uri.groups.path);
    if (host && host.toLowerCase() !== "localhost") {
      if (!windows || !/^[a-z0-9._-]+$/i.test(host)) throw new Error("无法识别此文件 URI 的主机。");
      return `//${host}${path}`;
    }
    return windows && /^\/[a-z]:\//i.test(path) ? path.slice(1) : path;
  }
  if (link.line) {
    path = path.replace(/(?:#L\d+(?:-L?\d+)?|:\d+(?::\d+|-\d+)?)\.?$/i, "");
  }
  if (windows) path = path.replaceAll("\\", "/");
  if (windows && /^\/[a-z]:\//i.test(path)) return path.slice(1);
  if (windows ? /^(?:[a-z]:\/|\/\/)/i.test(path) : path.startsWith("/")) return path;
  if (path.startsWith("~/") && userHome) return `${userHome}/${path.slice(2)}`;
  if (windows && path.startsWith("/") && /^[a-z]:/i.test(cwd ?? "")) return `${cwd.slice(0, 2)}${path}`;
  if (!cwd || !path || path.startsWith("~") || (windows && /^(?:\/|[a-z]:)/i.test(path))) {
    throw new Error("无法从这个终端确定文件的绝对路径。");
  }
  return `${cwd}/${path}`;
}

/** Converts an absolute path to a VS Code CLI URI, with optional editor coordinates. */
export function targetUri(path, { authority, windows }, line, column) {
  if (windows) path = path.replaceAll("\\", "/");
  if (!path || /[\x00-\x1f\x7f]/u.test(path)) throw new Error("路径为空或含有控制字符。");
  let drive = "";
  let host = "";
  if (windows && /^[a-z]:\//i.test(path)) {
    drive = `/${path.slice(0, 2)}`;
    path = path.slice(2);
  } else if (windows && path.startsWith("//")) {
    if (authority) throw new Error("当前不支持远程 Windows 的 UNC 路径。");
    const unc = /^\/\/([a-z0-9._-]+)(\/.+)$/i.exec(path);
    if (!unc) throw new Error("无法识别此 UNC 路径。");
    [, host, path] = unc;
  } else if (windows || !path.startsWith("/")) {
    throw new Error("VS Code 需要绝对路径。");
  }

  const prefix = authority ? `vscode-remote://${authority}` : `file://${host}`;
  const suffix = Number.isSafeInteger(line) && line > 0
    ? `:${line}${Number.isSafeInteger(column) && column > 0 ? `:${column}` : ""}`
    : "";
  return prefix + drive + path.split("/").map(encode).join("/") + suffix;
}
