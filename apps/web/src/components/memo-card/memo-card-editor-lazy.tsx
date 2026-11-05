import { lazy } from "react";

/**
 * Editing one card needs the whole TipTap pipeline — the editor, its extension
 * list and ProseMirror underneath. Importing it eagerly dragged that chunk
 * (the single largest one in the build) into the startup graph for every
 * visitor, even though most sessions never edit a memo. It now loads on the
 * first edit, and `memo-card.tsx` holds a skeleton while it arrives.
 *
 * No idle prefetch on purpose: edits are rare, and warming ~176KB gzipped of
 * editor for a maybe would compete with the timeline's own images.
 */
export const MemoCardEditor = lazy(async () => {
  const module = await import("@/components/memo-card/memo-card-editor");
  return { default: module.MemoCardEditor };
});
