import { openFile, showError } from "./bridge.js";

/** Handles the file link from its clicked terminal and leaves other link kinds to Herdr. */
export async function handleLink({ link, source }) {
  if (link.kind !== "file") return "pass";
  try {
    await openFile(link, source);
  } catch (error) {
    showError(error);
  }
  return "handled";
}
