import assert from "node:assert/strict";
import { test } from "node:test";
import { filePath, sshAuthority, targetUri, wslAuthority } from "../mods/vscode-bridge/paths.js";

test("preserves coordinates and encodes spaces, Unicode, and shell metacharacters", () => {
  const name = "/srv/中文 code/& '$().js";
  const link = { raw: `${name}:12:4.`, path: null, line: 12, column: 4 };
  assert.equal(filePath(link, "/tmp", null, false), name);
  assert.equal(
    targetUri(name, { authority: sshAuthority("work"), windows: false }, link.line, link.column),
    "vscode-remote://ssh-remote+work/srv/%E4%B8%AD%E6%96%87%20code/%26%20%27%24%28%29.js:12:4",
  );
});

test("resolves relative Windows paths and preserves existing literal paths", () => {
  const cwd = "C:\\My Work";
  assert.equal(filePath({ raw: "./src/app.js:8", line: 8 }, cwd, null, true), `${cwd}/./src/app.js`);
  assert.equal(filePath({ raw: "ignored", path: "/tmp/name:20" }, cwd, null, false), "/tmp/name:20");
  assert.equal(targetUri(cwd, { windows: true }), "file:///C:/My%20Work");
  assert.equal(targetUri("\\\\server\\share\\a b", { windows: true }), "file://server/share/a%20b");
});

test("handles remote file URIs, home-relative links, and line ranges", () => {
  assert.equal(filePath({ raw: "file:///home/me/a%20b" }, null, null, false), "/home/me/a b");
  assert.equal(filePath({ raw: "~/a#L5-L8", line: 5 }, null, "/home/me", false), "/home/me/a");
  assert.equal(targetUri("/home/me/a b", { authority: wslAuthority("Ubuntu Demo") }), "vscode-remote://wsl+Ubuntu%20Demo/home/me/a%20b");
  assert.throws(() => filePath({ raw: "./a" }, null, null, false), /绝对路径/);
  assert.throws(() => targetUri("/tmp/a\n", {}), /控制字符/);
});

test("preserves SSH aliases with case or connection qualifiers", () => {
  const host = "Me@Host:2222";
  const authority = sshAuthority(host);
  const payload = Buffer.from(authority.slice("ssh-remote+".length), "hex").toString("utf8");
  assert.deepEqual(JSON.parse(payload), { hostName: host });
  assert.throws(() => sshAuthority("-oProxyCommand"), /SSH/);
});
