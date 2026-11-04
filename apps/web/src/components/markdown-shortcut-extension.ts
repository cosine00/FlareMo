import { Extension, InputRule } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

/**
 * Typing `[label](url)` by hand used to save `\[label\](url)`.
 *
 * Three things collude there: the editor is a rich-text document, so the
 * characters go in literally; the markdown serializer has to escape the
 * brackets (otherwise the note would re-parse as link syntax it never meant);
 * and the Link extension's `linkOnPaste`/autolink still wraps the bare URL in
 * a link, brackets included. The result renders as backslashes plus half a
 * link, and there is no way to fix it from the reading side.
 *
 * The shortcut fires on the closing paren — the moment the run is complete —
 * and rewrites it into what the author already meant: a link mark over the
 * label. `![alt](url)` becomes an image for the same reason. The stored
 * markdown is unchanged; only the intermediate document stops being literal
 * text.
 */
const MARKDOWN_LINK = /(!?)\[([^[\]\n]+)\]\(([^\s()]+)\)$/;

export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addInputRules() {
    return [
      new InputRule({
        find: MARKDOWN_LINK,
        handler: ({ state, range, match }) => {
          const [bang, label, href] = [match[1], match[2] ?? "", match[3]];
          if (!href) return null;

          // `\[label\](url)` is what the old path stored; an author who types
          // the backslash again is asking for literal text, not a link.
          const before =
            range.from > 1
              ? state.doc.textBetween(
                  range.from - 1,
                  range.from,
                  undefined,
                  "\ufffc",
                )
              : "";
          if (before === "\\") return null;

          const { tr } = state;

          if (bang) {
            const image = state.schema.nodes.image;
            if (!image) return null;
            tr.replaceWith(
              range.from,
              range.to,
              image.create({ src: href, alt: label }),
            );
          } else {
            const link = state.schema.marks.link;
            if (!link) return null;
            tr.replaceWith(
              range.from,
              range.to,
              state.schema.text(label, [link.create({ href })]),
            );
          }

          // Keep the caret where the run ended, and drop the mark the caret
          // inherited from it — otherwise the next word typed would silently
          // become part of the link.
          tr.setSelection(
            Selection.near(tr.doc.resolve(range.from + label.length)),
          );
          tr.setStoredMarks([]);
        },
      }),
    ];
  },
});
