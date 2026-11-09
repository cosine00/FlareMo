import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getMemoContext } from "@/api";
import { cn } from "@/lib/utils";

/** Same ceiling as the blog: more cards than this and the note drowns. */
const QUOTE_LIMIT = 3;
/** A card is a reminder to look back, not a full reprint. */
const SNIPPET_LIMIT = 200;

/**
 * `[ID.1234](/m/1234/)` — the blog's canonical reference, which the composer
 * inserts and hug00 expands. Accepted in both the relative form and the
 * absolute `https://hux.ink/m/1234/` one, because a reference copied from the
 * blog comes with its host attached.
 *
 * The memo path has to sit at the start of the target: `/foo/m/9/` on another
 * site is a page that happens to mention a note, not a reference.
 */
const MEMO_LINK_RE =
  /\[[^\]]*\]\(\s*<?(?:(?:https?:)?\/\/[^\s/)]+)?\/(?:m|memo)\/([\w-]+)\/?>?(?:\s+["'][^"']*["'])?\s*\)/g;

/**
 * The memos a body quotes, in reading order, deduplicated and capped. Only the
 * site-relative `/m/` form counts: an absolute link to some other blog is a
 * link, not a reference to a note in this journal.
 */
export function quoteIdsIn(content: string): string[] {
  const ids: string[] = [];
  MEMO_LINK_RE.lastIndex = 0;
  for (let match = MEMO_LINK_RE.exec(content); match; ) {
    const id = match[1];
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= QUOTE_LIMIT) break;
    match = MEMO_LINK_RE.exec(content);
  }
  return ids;
}

/** Plain reading text of a quoted note: no pictures, tags, or nested quotes. */
function snippetOf(markdown: string): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^>[^\n]*$/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)#[^\s#]+/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (text.length <= SNIPPET_LIMIT) return text;
  return `${text.slice(0, SNIPPET_LIMIT).replace(/\s+\S*$/, "")} ……`;
}

function MemoQuoteCard({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["memo-quote", id],
    queryFn: () => getMemoContext(id),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const snippet = data?.memo ? snippetOf(data.memo.content) : "";
  // Deleted, private, or still loading: the inline link above already carries
  // the reference, so an empty card adds nothing.
  if (!data?.memo || !snippet) return null;

  return (
    <figure className="memo-quote-card">
      <Link
        onClick={(event) => event.stopPropagation()}
        params={{ memoId: id }}
        to="/memo/$memoId"
      >
        ID.{id}
      </Link>
      <blockquote className="whitespace-pre-line">{snippet}</blockquote>
    </figure>
  );
}

/**
 * Quote cards under a note body, mirroring what the blog renders for the same
 * markdown: the reference stays a link in the prose, and the quoted note's text
 * is repeated below it so the reader does not have to leave the page to make
 * sense of the sentence.
 */
export function MemoQuoteCards({
  className,
  ids,
}: {
  className?: string;
  ids: string[];
}) {
  if (ids.length === 0) return null;
  return (
    // No gap: the card's own margin sets the rhythm, matching the blog where
    // one blockquote's 6px margin is all that separates it from the next.
    <div className={cn("mt-0 flex flex-col", className)}>
      {ids.map((id) => (
        <MemoQuoteCard id={id} key={id} />
      ))}
    </div>
  );
}
