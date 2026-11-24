import { describe, it, expect } from "vitest";
import { describeNoteDraft, noteBodySchema } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("allows saving new text under the limit", () => {
    expect(describeNoteDraft("Generics are like parameters", "")).toEqual({
      length: 28,
      max: MAX_NOTE_LENGTH,
      tooLong: false,
      empty: false,
      unchanged: false,
      canSave: true,
      error: null,
    });
  });

  it("does not allow saving an empty or whitespace-only note", () => {
    const draft = describeNoteDraft("   \n ", "");
    expect(draft.empty).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it("does not allow saving text that matches the saved note", () => {
    const draft = describeNoteDraft("same note ", "same note");
    expect(draft.unchanged).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it("allows saving an edit to an existing note", () => {
    expect(describeNoteDraft("new note", "old note").canSave).toBe(true);
  });

  it("allows a note exactly at the limit", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), "");
    expect(draft.tooLong).toBe(false);
    expect(draft.canSave).toBe(true);
  });

  it("flags a note one character over the limit and blocks saving", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 1), "");
    expect(draft.tooLong).toBe(true);
    expect(draft.length).toBe(MAX_NOTE_LENGTH + 1);
    expect(draft.canSave).toBe(false);
    expect(draft.error).toBe(
      "Your note is over 2,000 characters, so it was not saved."
    );
  });

  it("does not show an error for an empty note", () => {
    expect(describeNoteDraft("", "").error).toBeNull();
  });

  it("measures the limit after trimming, as the server does", () => {
    const draft = describeNoteDraft(` ${"a".repeat(MAX_NOTE_LENGTH)} `, "");
    expect(draft.tooLong).toBe(false);
    expect(draft.length).toBe(MAX_NOTE_LENGTH);
  });
});

describe("noteBodySchema", () => {
  it("trims the note it accepts", () => {
    expect(noteBodySchema.parse("  a note \n")).toBe("a note");
  });

  it("rejects a whitespace-only note with a message", () => {
    const result = noteBodySchema.safeParse("   ");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Write something before saving your note."
    );
  });

  it("rejects a note over the limit with a message naming it", () => {
    const result = noteBodySchema.safeParse("a".repeat(MAX_NOTE_LENGTH + 1));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Your note is over 2,000 characters, so it was not saved."
    );
  });
});
