import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraft = {
  length: number;
  max: number;
  tooLong: boolean;
  empty: boolean;
  unchanged: boolean;
  canSave: boolean;
};

// Mirrors the server's saveNoteSchema (trim, min 1, max MAX_NOTE_LENGTH), so
// the Save button is never enabled for a note the action would reject.
// `savedBody` needs no trim: the action stores the note already trimmed.
export function describeDraft(draft: string, savedBody: string): NoteDraft {
  const trimmed = draft.trim();
  const tooLong = trimmed.length > MAX_NOTE_LENGTH;
  const empty = trimmed.length === 0;
  const unchanged = trimmed === savedBody;
  return {
    length: trimmed.length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    unchanged,
    canSave: !tooLong && !empty && !unchanged,
  };
}
