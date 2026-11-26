/** A user-facing error with English by default and an optional Chinese translation. */
export class BridgeError extends Error {
  /** Stores the English message and its Chinese translation for the notification. */
  constructor(english, chinese) {
    super(english);
    this.chinese = chinese;
  }
}

/** Returns the bridge interface labels for the selected language. */
export function labels(chinese) {
  return chinese
    ? { open: "用 VS Code 打开", opening: "正在打开 VS Code…", failed: "无法在 VS Code 中打开" }
    : { open: "Open in VS Code", opening: "Opening VS Code…", failed: "Could not open in VS Code" };
}
