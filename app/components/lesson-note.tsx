import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { describeNoteDraft, type NoteDraft } from "~/modules/lesson-notes";

export type LessonNoteData = { body: string; updatedAt: string } | null;

// Laid out like the Questions & Discussion card further down the lesson, so
// the two read as one family: same header, same editor, same footer row.
export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const savedBody = note?.body ?? "";
  const [body, setBody] = useState(savedBody);
  const isSaving = fetcher.state !== "idle";
  const draft = describeNoteDraft(body, savedBody);

  return (
    <Card className="mb-8">
      <CardContent>
        <LessonNoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
            className="min-h-28 resize-y"
          />
          <LessonNoteFooter
            note={note}
            draft={draft}
            isSaving={isSaving}
            error={fetcher.data?.error}
          />
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function LessonNoteHeader() {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your notes</h2>
      </div>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        Only you can see these
      </span>
    </div>
  );
}

function LessonNoteFooter({
  note,
  draft,
  isSaving,
  error,
}: {
  note: LessonNoteData;
  draft: NoteDraft;
  isSaving: boolean;
  error?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={isSaving || !draft.canSave}>
        {isSaving ? "Saving..." : "Save note"}
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : (
        note && (
          <span
            suppressHydrationWarning
            className="text-xs text-muted-foreground"
          >
            {draft.unchanged ? "Saved" : "Unsaved changes"} · last edited{" "}
            {formatRelativeTime(note.updatedAt)}
          </span>
        )
      )}
      <span
        className={cn(
          "ml-auto text-xs",
          draft.tooLong ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {draft.length} / {draft.max}
      </span>
    </div>
  );
}
