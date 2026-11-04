/**
 * Pasting a markdown link as plain text is a data-loss trap: ProseMirror
 * types the brackets literally, the markdown serializer escapes them
 * (`\[FlareMo\](url)`), and the Link extension still autolinks the URL inside
 * — so the note saves as half-escaped text and half a link, and the reader
 * sees backslashes instead of a clickable reference.
 *
 * The composer checks this before it lets a plain-text paste through and
 * hands the text to the markdown parser instead.
 */

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";

/** `[text](url)` or `![alt](url)`, with an absolute or site-relative target. */
const MARKDOWN_LINK = /!?\[[^[\]\n]*\]\((?:https?:\/\/|mailto:|\/)[^\s)]*\)/g;

/** Nodes that live inside a paragraph rather than between them. */
const INLINE_TYPES = new Set(["text", "image", "hardBreak"]);

export function looksLikeMarkdownLink(text: string): boolean {
  MARKDOWN_LINK.lastIndex = 0;
  for (
    let match = MARKDOWN_LINK.exec(text);
    match;
    match = MARKDOWN_LINK.exec(text)
  ) {
    // `\[text\](url)` is what the old paste path produced. Reparsing it would
    // yield literal brackets, not a link, so it must stay untouched.
    if (text[match.index - 1] !== "\\") return true;
  }
  return false;
}

/**
 * Inline content of a paste that is one visual run of text — a sentence with
 * a link in it, or a lone image. Everything else (headings, lists, several
 * paragraphs) has to keep its block structure. `undefined` means "insert as
 * markdown", the ordinary path.
 */
function inlineRun(parsed: JSONContent): JSONContent[] | undefined {
  const blocks = parsed.content ?? [];
  const [first] = blocks;
  if (blocks.length === 1 && first?.type === "paragraph") {
    return first.content ?? [];
  }
  // A lone image parses to a bare inline node at document level; the document
  // cannot hold it, so it is floated into the paragraph the caret is in.
  if (
    blocks.length > 0 &&
    blocks.every((node) => INLINE_TYPES.has(node.type ?? ""))
  ) {
    return blocks;
  }
  return undefined;
}

/**
 * Inserts `text` as markdown at the caret.
 *
 * A one-sentence paste goes in inline — otherwise ProseMirror would split the
 * paragraph and drop the link on its own line.
 */
export function insertPastedMarkdown(editor: Editor, text: string): void {
  const parsed = editor.storage.markdown.manager.parse(text);
  const inline = inlineRun(parsed);
  if (inline) {
    editor.commands.insertContent(inline);
    return;
  }
  editor.commands.insertContent(text, { contentType: "markdown" });
}
