import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  MAX_NOTE_LENGTH,
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);
const LATEST = new Date(2026, 9, 8, 18, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("adds a Bookmark, then removes it on the second toggle", () => {
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], LATER)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], LATER);
    toggleBookmark(db, base.user.id, lessonIds[0], LATEST);

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });
});

describe("saving a Note", () => {
  it("creates the Note with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "  Remember this  ",
      NOW
    );

    expect(result).toEqual({
      ok: true,
      note: { body: "Remember this", updatedAt: NOW.toISOString() },
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Remember this",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First draft", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second draft", LATER);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second draft",
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("keeps characters like # and * exactly as typed", () => {
    saveNote(db, base.user.id, lessonIds[0], "# heading?\n*not bold*", NOW);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "# heading?\n*not bold*"
    );
  });

  it(`accepts a Note of exactly ${MAX_NOTE_LENGTH} characters`, () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH),
      NOW
    );

    expect(result.ok).toBe(true);
  });

  it(`refuses a Note over ${MAX_NOTE_LENGTH} characters and keeps the old one`, () => {
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      LATER
    );

    expect(result).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });

  it("removes the Note when the box is saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "Temporary", NOW);

    saveNote(db, base.user.id, lessonIds[0], "   ", LATER);

    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });
});

describe("the Saved lists", () => {
  it("lists only the Student's own Bookmarks, newest first, with Lesson and Course", () => {
    const other = addStudent("Other");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[2], LATER);
    toggleBookmark(db, other.id, lessonIds[1], LATEST);

    const rows = listBookmarks(db, base.user.id);

    expect(rows.map((row) => row.lessonTitle)).toEqual([
      "Lesson 3",
      "Lesson 1",
    ]);
    expect(rows[0]).toMatchObject({
      lessonId: lessonIds[2],
      courseTitle: base.course.title,
      courseSlug: base.course.slug,
    });
  });

  it("lists only the Student's own Notes, most recently edited first", () => {
    const other = addStudent("Other");
    saveNote(db, base.user.id, lessonIds[0], "Older", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Newer", LATER);
    saveNote(db, other.id, lessonIds[2], "Not mine", LATEST);
    // Editing the older Note brings it to the top.
    saveNote(db, base.user.id, lessonIds[0], "Edited", LATEST);

    const rows = listNotes(db, base.user.id);

    expect(rows.map((row) => row.body)).toEqual(["Edited", "Newer"]);
    expect(rows[0]).toMatchObject({
      lessonId: lessonIds[0],
      lessonTitle: "Lesson 1",
      courseTitle: base.course.title,
      courseSlug: base.course.slug,
    });
  });
});
