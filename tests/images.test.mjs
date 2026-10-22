import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getImageProps } from "next/image.js";

const require = createRequire(import.meta.url);

test("private, signed and blob images retain their exact URL without optimizer fetches", () => {
  for (const src of [
    "/api/media/dm?path=thread%2Fphoto.jpg",
    "https://example.supabase.co/storage/v1/object/sign/dm/photo.jpg?token=fake-test-token",
    "blob:https://habitbase.test/fake-test-preview",
  ]) {
    const { props } = getImageProps({ src, alt: "添付画像", fill: true, unoptimized: true });
    assert.equal(props.src, src);
    assert.equal(props.srcSet, undefined);
    assert.equal(props.style.objectFit, undefined);
    assert.equal(props.style.position, "absolute");
  }
});

test("actual ChatImage preserves natural aspect ratio and resets for a different URL", async () => {
  const source = await readFile(new URL("../app/components/ChatImage.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  let state = null;
  const compiled = { exports: {} };
  vm.runInNewContext(code, {
    module: compiled, exports: compiled.exports,
    require(name) {
      if (name === "react") return { useState: () => [state, next => { state = next; }] };
      if (name === "next/image") return function Image() {};
      assert.equal(name, "react/jsx-runtime");
      return require(name);
    },
  });
  const ChatImage = compiled.exports.default;
  const render = src => ChatImage({ src, alt: "画像", className: "max-h-[360px]" });
  let frame = render("/a");
  assert.equal(frame.props.style.aspectRatio, 4 / 3);
  assert.equal(frame.props.children.props.unoptimized, true);
  assert.equal(frame.props.children.props.fill, true);
  assert.match(frame.props.children.props.className, /object-contain/);
  frame.props.children.props.onLoad({ currentTarget: { naturalWidth: 240, naturalHeight: 800 } });
  assert.equal(render("/a").props.style.aspectRatio, 0.3);
  assert.equal(render("/b").props.style.aspectRatio, 4 / 3);
  frame = render("/b");
  frame.props.children.props.onLoad({ currentTarget: { naturalWidth: 800, naturalHeight: 240 } });
  assert.equal(render("/b").props.style.aspectRatio, 800 / 240);
  frame.props.children.props.onLoad({ currentTarget: { naturalWidth: 0, naturalHeight: 0 } });
  assert.equal(render("/b").props.style.aspectRatio, 800 / 240);
});
