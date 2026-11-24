import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
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
  });

  it("measures the limit after trimming, as the server does", () => {
    const draft = describeNoteDraft(` ${"a".repeat(MAX_NOTE_LENGTH)} `, "");
    expect(draft.tooLong).toBe(false);
    expect(draft.length).toBe(MAX_NOTE_LENGTH);
  });
});
