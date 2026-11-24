import { describeDraft as describe, type NoteDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the lesson note editor shows for the text in the box: the character
 * count, whether it is over the limit, and whether Save should be enabled.
 * `savedBody` is the note as last saved ("" when there is none).
 */
export function describeNoteDraft(draft: string, savedBody: string): NoteDraft {
  return describe(draft, savedBody);
}
