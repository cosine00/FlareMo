import type { Editor } from "@tiptap/react";
import {
  BoldIcon,
  HashIcon,
  ImagePlusIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
} from "lucide-react";
import {
  type ActiveFormats,
  FORMAT_SHORTCUTS,
  toggleFormat,
} from "@/components/composer/format-actions";
import { ToolButton, ToolDivider } from "@/components/composer/tool-button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

/**
 * The card editor's tool rail. The main composer's rail carries voice, the
 * schedule menu and the long-form canvas — none of which mean anything while
 * editing an existing note in place — so this is the same insert/shape group
 * (tag, image, bold, bullets, numbers, to-dos) on its own.
 */
export function MemoEditorToolbar({
  activeFormats,
  disabled,
  withEditor,
  onAddFiles,
  inputId,
}: {
  /** Formats active at the selection; see the composer's rail. */
  activeFormats: ActiveFormats;
  disabled: boolean;
  withEditor: (action: (editor: Editor) => void) => void;
  /** Files picked through the image button; same route as paste/drop. */
  onAddFiles: (files: File[]) => void;
  /** The file input's id; must not collide across mounted editors. */
  inputId: string;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ToolButton
        disabled={disabled}
        label={t("composer.addTag")}
        onClick={() =>
          withEditor((editor) => {
            editor
              .chain()
              .focus()
              .insertContentAt(editor.state.selection.to, "#")
              .run();
          })
        }
      >
        <HashIcon />
      </ToolButton>
      <ToolButton
        disabled={disabled}
        label={t("composer.addAttachment")}
        render={
          <label aria-label={t("composer.addAttachment")} htmlFor={inputId} />
        }
      >
        <ImagePlusIcon />
        <Input
          className="hidden"
          disabled={disabled}
          id={inputId}
          multiple
          type="file"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length === 0) return;
            onAddFiles(files);
          }}
        />
      </ToolButton>
      <ToolDivider className="hidden sm:block" />
      <ToolButton
        active={activeFormats.bold}
        disabled={disabled}
        label={t("article.toolBold")}
        shortcut={FORMAT_SHORTCUTS.bold}
        // Keep the editor's selection (and its bubble menu) while clicking.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => withEditor((editor) => toggleFormat(editor, "bold"))}
      >
        <BoldIcon />
      </ToolButton>
      <ToolButton
        disabled={disabled}
        label={t("composer.bulletList")}
        onClick={() =>
          withEditor((editor) => {
            editor.chain().focus().toggleBulletList().run();
          })
        }
      >
        <ListIcon />
      </ToolButton>
      <ToolButton
        disabled={disabled}
        label={t("composer.orderedList")}
        onClick={() =>
          withEditor((editor) => {
            editor.chain().focus().toggleOrderedList().run();
          })
        }
      >
        <ListOrderedIcon />
      </ToolButton>
      <ToolButton
        disabled={disabled}
        label={t("composer.taskList")}
        onClick={() =>
          withEditor((editor) => {
            editor.chain().focus().toggleTaskList().run();
          })
        }
      >
        <ListTodoIcon />
      </ToolButton>
    </div>
  );
}
