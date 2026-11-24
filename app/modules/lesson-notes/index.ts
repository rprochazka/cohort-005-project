import {
  describeDraft,
  noteBodySchema as bodySchema,
  type NoteDraft,
} from "./lib/draft";

export type { NoteDraft };

/**
 * What the lesson note editor shows for the text in the box: the character
 * count, whether it is over the limit, and whether Save should be enabled.
 * `savedBody` is the note as last saved ("" when there is none).
 */
export function describeNoteDraft(text: string, savedBody: string): NoteDraft {
  return describeDraft(text, savedBody);
}

/** The rules a lesson note's body must pass before it is saved. */
export const noteBodySchema = bodySchema;
