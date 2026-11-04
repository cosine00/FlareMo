// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  insertPastedMarkdown,
  looksLikeMarkdownLink,
} from "@/lib/markdown-paste";
import { buildComposerExtensions } from "./rich-composer-editor";

/**
 * Markdown round-trip idempotence for the composer whitelist. The storage
 * format is plain GFM text, so the hard requirement is: whatever the editor
 * serializes must re-parse to itself — a memo saved once and reopened must
 * not drift. Fresh input is allowed to normalize (e.g. spacing); the second
 * pass may not change anything.
 */
describe("composer markdown round-trip", () => {
  const editor = new Editor({
    extensions: buildComposerExtensions(""),
    content: "",
    contentType: "markdown",
  });

  const round = (markdown: string) => {
    editor.commands.setContent(markdown, { contentType: "markdown" });
    return editor.getMarkdown();
  };

  // The "[[" autocomplete inserts a link mark. Inserting the markdown as
  // literal text instead used to save `\[title\](/memo/id)`: a dead link.
  it("stores an accepted wikilink as a real markdown link", () => {
    editor.commands.setContent("看 [[周", { contentType: "markdown" });
    const end = editor.state.doc.content.size - 1;
    editor
      .chain()
      .insertContentAt({ from: end - 3, to: end }, [
        {
          type: "text",
          text: "周报",
          marks: [{ type: "link", attrs: { href: "/memo/abc" } }],
        },
        { type: "text", text: " " },
      ])
      .unsetMark("link")
      .insertContent("续写")
      .run();
    expect(editor.getMarkdown()).toBe("看 [周报](/memo/abc) 续写");
  });

  // Every element on the composer whitelist, plus the classic stress cases
  // (nested quotes, CJK, hard breaks, characters markdown likes to escape).
  const samples: string[] = [
    "",
    "只有一段话的旧笔记。",
    "# 一级标题\n\n正文带 **加粗**、*斜体*、~~删除线~~ 和 `行内代码`。",
    "## Heading two\n\n### Heading three\n\nSome prose.",
    "> 引用第一层\n>\n> > 引用第二层",
    "- 无序一\n- 无序二\n  - 嵌套项",
    "1. 第一\n2. 第二\n3. 第三",
    "- [ ] 未完成任务\n- [x] 已完成任务",
    "```js\nconst x = 1;\n```",
    "---",
    "段落前\n\n---\n\n段落后",
    "![附件图](/file/attachments/0000-aa/shot.png)",
    "链接到 [FlareMo](https://flaremo.app) 的正文。",
    "#生活 #workout 混排标签",
    "行尾两个空格是硬换行  \n下一行接续",
    "星号 * 与下划线 _ 与反引号 ` 的字面量",
    "2 * 3 * 4 和 snake_case_word",
    "emoji 🎉 与日文 千字あ与韩文 한글 混排",
    "表格之外先不进白名单：| 井号 | 普通文字 |",
  ];

  it.each(samples)("stays stable after the first serialization: %s", (md) => {
    const once = round(md);
    const twice = round(once);
    expect(twice).toBe(once);
  });

  it("keeps the whitelist semantics on the way out", () => {
    expect(round("# 标题\n\n**粗** *斜* ~~删~~ `码`")).toContain("# 标题");
    expect(round("- [ ] 待办")).toContain("- [ ] 待办");
    expect(round("- [x] 完成")).toContain("- [x] 完成");
    expect(round("![图](/file/attachments/x/y.png)")).toContain(
      "![图](/file/attachments/x/y.png)",
    );
    expect(round("看 #标签")).toContain("#标签");
    expect(round("```\nconst x = 1;\n```")).toContain("const x = 1;");
  });

  it("does not resurrect underline or introduce HTML", () => {
    const once = round("正文 <u>下划线</u> 不放行");
    const twice = round(once);
    expect(twice).toBe(once);
    // Inline HTML stays literal text in storage; the card renderer never sees
    // a raw <u> element from the editor's own output.
    expect(once).not.toMatch(/<u>/i);
  });

  // The paste path: literal text would be escaped (`\[x\](url)`) while the
  // Link extension still autolinked the URL, saving a note that rendered as
  // backslashes plus half a link. Parsing the paste as markdown keeps it whole.
  it("stores a pasted markdown link as a real link", () => {
    editor.commands.setContent("看 ", { contentType: "markdown" });
    insertPastedMarkdown(
      editor,
      "[FlareMo](https://github.com/realchendahuang/FlareMo)",
    );
    expect(editor.getMarkdown()).toBe(
      "看 [FlareMo](https://github.com/realchendahuang/FlareMo)",
    );
  });

  it("stores a pasted markdown image as a real image", () => {
    editor.commands.setContent("看图：", { contentType: "markdown" });
    insertPastedMarkdown(editor, "![图](https://img.hux.ink/a.png)");
    expect(editor.getMarkdown()).toBe("看图：![图](https://img.hux.ink/a.png)");
  });

  it("keeps the link whole when the paste carries prose around it", () => {
    editor.commands.setContent("", { contentType: "markdown" });
    insertPastedMarkdown(
      editor,
      "把 memos 迁移到 [FlareMo](https://github.com/realchendahuang/FlareMo) 上",
    );
    expect(editor.getMarkdown()).toBe(
      "把 memos 迁移到 [FlareMo](https://github.com/realchendahuang/FlareMo) 上",
    );
  });

  it("recognises only pastes that carry markdown link syntax", () => {
    expect(looksLikeMarkdownLink("[FlareMo](https://github.com/x/y)")).toBe(
      true,
    );
    expect(
      looksLikeMarkdownLink("看这个 ![图](https://img.hux.ink/a.png) 好看"),
    ).toBe(true);
    expect(looksLikeMarkdownLink("站内 [周报](/memo/abc)")).toBe(true);
    expect(looksLikeMarkdownLink("裸链接 https://github.com/x/y")).toBe(false);
    expect(looksLikeMarkdownLink("普通的 [方括号] 文字")).toBe(false);
    expect(looksLikeMarkdownLink("已经转义过的 \\[x\\](https://x/y)")).toBe(
      false,
    );
  });
});

/**
 * Hand-typed syntax: the same trap as the paste path, one keystroke at a
 * time. ProseMirror inserts the characters literally, so the shortcut has to
 * fire on the closing paren and hand back a real link.
 */
describe("typed markdown link syntax", () => {
  const editor = new Editor({
    extensions: buildComposerExtensions(""),
    content: "",
    contentType: "markdown",
    element: document.createElement("div"),
  });

  /** Feeds one character at a time through the input-rule pipeline. */
  const type = (text: string) => {
    const { view } = editor;
    for (const char of text) {
      const { from, to } = view.state.selection;
      // The default transaction the view would apply if nothing handled it.
      const insert = () => view.state.tr.insertText(char, from, to);
      const handled = view.someProp("handleTextInput", (handler) =>
        handler(view, from, to, char, insert),
      );
      if (!handled) view.dispatch(insert());
    }
  };

  const types = (before: string, text: string) => {
    editor.commands.setContent(before, { contentType: "markdown" });
    type(text);
    return editor.getMarkdown();
  };

  it("turns a typed link into a real link", () => {
    expect(types("", "[FlareMo](https://github.com/x/y)")).toBe(
      "[FlareMo](https://github.com/x/y)",
    );
  });

  it("keeps the link when it is typed inside a sentence", () => {
    expect(
      types("把 memos 迁移到 ", "[FlareMo](https://github.com/x/y) 上"),
    ).toBe("把 memos 迁移到 [FlareMo](https://github.com/x/y) 上");
  });

  it("turns a typed image into a real image", () => {
    expect(types("看图：", "![图](https://img.hux.ink/a.png)")).toBe(
      "看图：![图](https://img.hux.ink/a.png)",
    );
  });

  it("does not extend the link over the words typed after it", () => {
    expect(types("", "[周报](/memo/abc) 已归档")).toBe(
      "[周报](/memo/abc) 已归档",
    );
  });

  it("leaves an explicitly escaped bracket alone", () => {
    types("", "\\[x\\](https://x/y)");
    expect(editor.state.doc.textContent).toBe("\\[x\\](https://x/y)");
    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"');
  });
});
