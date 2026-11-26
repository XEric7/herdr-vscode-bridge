import { View, div } from "gpui-kit";
import { checking, closeOverlay, focused, spaces, theme } from "herdr";
import { openFolder, showError } from "./bridge.js";

/** Opens the focused terminal's folder, or the active space folder as a fallback. */
async function openCurrentFolder() {
  const focus = focused();
  const allSpaces = spaces();
  const space = allSpaces.find((item) => item.id === focus?.space) ?? allSpaces.find((item) => item.active);
  const terminal = focus?.terminal;
  const separator = terminal?.indexOf("/") ?? -1;
  const machine = focus?.cwd && terminal
    ? (separator < 0 ? null : terminal.slice(0, separator))
    : (space?.machine ?? null);
  try {
    await openFolder(focus?.cwd || space?.folder, machine);
  } catch (error) {
    showError(error);
  }
}

/** Provides a layout button and a one-shot overlay for the shortcut and palette. */
export default class VscodeBridge extends View {
  /** Launches once for a shortcut or palette overlay; a layout button waits for a click. */
  init(props, cx) {
    this.overlay = props?.overlay;
    if (!checking() && this.overlay) {
      cx.spawn(async () => {
        await openCurrentFolder();
        closeOverlay(this.overlay);
      });
    }
  }

  /** Renders the launch button or a short progress message inside the overlay. */
  render() {
    const colors = theme();
    if (this.overlay) {
      return div().size_full().flex().items_center().justify_center()
        .text_size(13).text_color(colors.foreground).child("正在打开 VS Code…");
    }
    return div().id("vscode-bridge-button").size_full().flex().items_center().justify_center()
      .text_size(13).text_color(colors.foreground).bg(colors.chrome)
      .cursor_pointer().hover((style) => style.bg(colors.hover))
      .on_click((_event, cx) => { cx.spawn(openCurrentFolder); })
      .child("用 VS Code 打开");
  }
}
