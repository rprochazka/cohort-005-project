import { describe, it, expect } from "vitest";
import {
  lessonParamsSchema,
  quizAnswerSchema,
  saveNoteSchema,
  submitQuizSchema,
} from "../schemas";

describe("lessonParamsSchema", () => {
  it("coerces the lesson id from the URL", () => {
    expect(lessonParamsSchema.parse({ slug: "ts", lessonId: "7" })).toEqual({
      lessonId: 7,
    });
  });

  it.each(["", "0", "abc", "1.5"])("rejects lessonId %j", (lessonId) => {
    expect(lessonParamsSchema.safeParse({ lessonId }).success).toBe(false);
  });
});

describe("submitQuizSchema", () => {
  it("coerces the quiz id", () => {
    expect(submitQuizSchema.parse({ quizId: "3" })).toEqual({ quizId: 3 });
  });

  it.each([null, "", "0", "x"])("rejects quizId %j", (quizId) => {
    expect(submitQuizSchema.safeParse({ quizId }).success).toBe(false);
  });
});

describe("quizAnswerSchema", () => {
  it("coerces a question and its chosen option", () => {
    expect(quizAnswerSchema.parse({ questionId: "2", optionId: "5" })).toEqual({
      questionId: 2,
      optionId: 5,
    });
  });

  it("rejects an empty option", () => {
    expect(
      quizAnswerSchema.safeParse({ questionId: "2", optionId: "" }).success
    ).toBe(false);
  });

  it("rejects a malformed question id", () => {
    expect(
      quizAnswerSchema.safeParse({ questionId: "", optionId: "5" }).success
    ).toBe(false);
  });
});

describe("saveNoteSchema", () => {
  it("stores the note trimmed", () => {
    expect(saveNoteSchema.parse({ body: " note " })).toEqual({ body: "note" });
  });

  it("rejects a missing body", () => {
    expect(saveNoteSchema.safeParse({}).success).toBe(false);
  });
});
