import { z } from "zod";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

export const noteBodySchema = z
  .string()
  .trim()
  .min(1, "Write something before saving your note.")
  .max(
    MAX_NOTE_LENGTH,
    `Your note is over ${MAX_NOTE_LENGTH.toLocaleString("en")} characters, so it was not saved.`
  );

export type NoteDraft = {
  length: number;
  max: number;
  tooLong: boolean;
  empty: boolean;
  unchanged: boolean;
  canSave: boolean;
  /** Why the note cannot be saved, shown only once it is too long. */
  error: string | null;
};

// The editor and the save action check the same schema, so the Save button
// is never enabled for a note the action would reject. `savedBody` needs no
// trim: the action stores the note already trimmed.
export function describeDraft(text: string, savedBody: string): NoteDraft {
  const trimmed = text.trim();
  const unchanged = trimmed === savedBody;
  const tooLong = trimmed.length > MAX_NOTE_LENGTH;
  const result = noteBodySchema.safeParse(text);
  return {
    length: trimmed.length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    empty: trimmed.length === 0,
    unchanged,
    canSave: !unchanged && result.success,
    error: tooLong ? (result.error?.issues[0]?.message ?? null) : null,
  };
}
