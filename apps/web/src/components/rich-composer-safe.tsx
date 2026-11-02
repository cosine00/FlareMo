import { Component, type ReactNode, Suspense, useEffect, useRef } from "react";
import type { RichComposerEditorProps } from "@/components/rich-composer-editor";
import { RichComposerEditor } from "@/components/rich-composer-editor-lazy";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * ProseMirror throws — rather than tolerates — markdown whose parsed shape
 * does not fit the editor schema ("Called contentMatchAt on a node with
 * invalid content"). One bad note would otherwise take out the whole route:
 * the crash surfaces far above this editor, at the route error boundary, as
 * "内容加载失败". The boundary here catches it at the editor instead and hands
 * the note to a plain textarea, so the text stays editable and a save simply
 * round-trips the markdown untouched.
 */
export class RichComposerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function PlainTextEditorFallback({
  content,
  ariaLabel,
  placeholder,
  disabled,
  autoFocus,
  onContentChange,
  onSubmitRequest,
  onEscape,
}: {
  content: string;
  ariaLabel: string;
  placeholder: string;
  disabled: boolean;
  autoFocus?: boolean;
  onContentChange: (markdown: string) => void;
  onSubmitRequest: () => void;
  onEscape?: () => void;
}) {
  const { t } = useI18n();
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // The rich editor focuses itself on mount; the fallback hands the caret
  // over the same way, without the autoFocus attribute.
  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="flex flex-col gap-1">
      <textarea
        aria-label={ariaLabel}
        className={cn(
          "composer-editor-content min-h-32 w-full resize-y rounded-lg border bg-background p-3",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
        disabled={disabled}
        placeholder={placeholder}
        ref={areaRef}
        value={content}
        onBlur={(event) => {
          // The composer's source of truth is markdown; keep it fed the
          // same way every keystroke would.
          onContentChange(event.target.value);
        }}
        onChange={(event) => onContentChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && onEscape) {
            onEscape();
            return;
          }
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !event.altKey
          ) {
            event.preventDefault();
            onSubmitRequest();
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        {t("composer.richEditorFallback")}
      </p>
    </div>
  );
}

/**
 * Drop-in wrapper around `RichComposerEditor` (the lazy one): same props, plus
 * a plain-text fallback so a schema-invalid note degrades to an editable
 * textarea instead of crashing the route. The key insight of the fallback is
 * that the markdown is the source of truth — editing it verbatim and saving is
 * always a faithful round-trip, no parser required.
 */
export function SafeRichComposerEditor(props: RichComposerEditorProps) {
  return (
    <RichComposerErrorBoundary
      fallback={
        <PlainTextEditorFallback
          ariaLabel={props.ariaLabel}
          autoFocus={props.autoFocus}
          content={props.content}
          disabled={props.disabled}
          placeholder={props.placeholder}
          onContentChange={props.onContentChange}
          onEscape={props.onEscape}
          onSubmitRequest={props.onSubmitRequest}
        />
      }
    >
      <Suspense
        fallback={<div className="min-h-32 bg-muted/30" aria-hidden="true" />}
      >
        <RichComposerEditor {...props} />
      </Suspense>
    </RichComposerErrorBoundary>
  );
}
