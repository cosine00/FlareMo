import { useQuery } from "@tanstack/react-query";
import { MessageSquareQuoteIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { getMemoContext, listMemos } from "@/api";
import { ToolButton } from "@/components/composer/tool-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { stripResourceName } from "@/lib/utils";

const SEARCH_MIN_LENGTH = 1;

/** `1234` or `ID.1234` — an exact reference the author typed by hand. */
const ID_QUERY_RE = /^(?:ID\.?\s*)?(\d{1,10})$/i;

/**
 * The composer's "quote a memo" tool. Picking a note inserts the blog's
 * canonical reference — `[ID.1234](/m/1234/)` — as a real link at the caret.
 * The site-relative `/m/` target is what hug00's renderers and RSS builder
 * both match on, so the quote expands into a card over there without any
 * per-site configuration; inside FlareMo the card renderer routes the same
 * link to the memo's detail page.
 */
export function ComposerQuoteMenu({
  disabled,
  withEditor,
}: {
  disabled: boolean;
  withEditor: (
    action: (editor: import("@tiptap/react").Editor) => void,
  ) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  // A bare number or ID.x is a direct address, not a keyword: fetch that
  // exact row even when the number never appears in any memo's text.
  const exactId = useMemo(
    () => ID_QUERY_RE.exec(trimmed)?.[1] ?? null,
    [trimmed],
  );
  const search = useQuery({
    queryKey: ["composer-quote-search", trimmed],
    queryFn: ({ signal }) => listMemos({ q: trimmed, page_size: 8 }, signal),
    enabled: open && trimmed.length >= SEARCH_MIN_LENGTH,
    staleTime: 30_000,
  });
  const exact = useQuery({
    queryKey: ["composer-quote-exact", exactId],
    queryFn: () => getMemoContext(exactId ?? ""),
    enabled: open && exactId != null,
    retry: false,
    staleTime: 30_000,
  });
  // A fresh opening starts a fresh search; stale text from last time would
  // flash yesterday's results under today's pointer.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const pick = (memoId: string) => {
    setOpen(false);
    withEditor((editor) => {
      // Inserted as a text node carrying the link mark, not as markdown:
      // insertContent parses strings as HTML (escaping the brackets) and the
      // markdown path wraps the reference in its own paragraph block. A
      // trailing space keeps the cursor from sticking to the link.
      editor.commands.insertContentAt(editor.state.selection.to, [
        {
          type: "text",
          text: `ID.${memoId}`,
          marks: [{ type: "link", attrs: { href: `/m/${memoId}/` } }],
        },
        { type: "text", text: " " },
      ]);
      // The menu hands focus back to its trigger when it closes; reclaim the
      // caret one frame later so the author can keep typing immediately.
      requestAnimationFrame(() => {
        if (!editor.isDestroyed) editor.commands.focus();
      });
    });
  };

  const exactMemo = exact.data?.memo;
  const results = useMemo(() => {
    const keywordHits = search.data?.memos ?? [];
    if (!exactMemo) return keywordHits;
    const rest = keywordHits.filter(
      (memo) => stripResourceName(memo.name, "memos") !== exactId,
    );
    return [exactMemo, ...rest];
  }, [search.data, exactMemo, exactId]);

  const searching = search.isFetching || (exactId != null && exact.isPending);
  const showHint = trimmed.length < SEARCH_MIN_LENGTH;
  const [activeIndex, setActiveIndex] = useState(0);

  // The menu's typeahead calls stopEvent() on every printable key while it is
  // open — including keys meant for this input — so the search box would never
  // receive a character. Keeping keydowns local (and handling the navigation
  // keys here) makes the field typeable again.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) pick(stripResourceName(target.name, "memos"));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <ToolButton
        disabled={disabled}
        label={t("composer.quoteMemo")}
        type="button"
        render={<DropdownMenuTrigger type="button" />}
      >
        <MessageSquareQuoteIcon />
      </ToolButton>
      <DropdownMenuContent align="start" className="w-72 p-1">
        <Input
          aria-label={t("composer.quoteMemo")}
          autoComplete="off"
          autoFocus
          className="h-8 bg-background text-sm"
          placeholder={t("composer.quoteSearch")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onSearchKeyDown}
        />
        <div className="mt-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {showHint && (
            <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
              {t("composer.quoteHint")}
            </p>
          )}
          {!showHint && searching && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {t("detail.searchingRelations")}
            </p>
          )}
          {!showHint && !searching && results.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {t("composer.quoteEmpty")}
            </p>
          )}
          {results.map((memo, index) => {
            const memoId = stripResourceName(memo.name, "memos");
            return (
              <DropdownMenuItem
                className="flex-col items-stretch gap-0.5 py-1.5 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                data-active={index === activeIndex ? "true" : undefined}
                key={memo.name}
                onClick={() => pick(memoId)}
              >
                <span className="line-clamp-2 whitespace-normal text-sm leading-5">
                  {memo.content}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  ID.{memoId}
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
