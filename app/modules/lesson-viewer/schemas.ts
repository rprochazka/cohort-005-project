import { z } from "zod";
import { noteBodySchema } from "~/modules/lesson-notes";
import type { Capability } from "~/modules/permissions/course-permissions.server";

export const lessonParamsSchema = z.object({
  lessonId: z.coerce.number().int().positive(),
});

export const createCommentSchema = z.object({
  intent: z.literal("create-comment"),
  body: z.string(),
  parentId: z.coerce.number().int().optional(),
});

export const editCommentSchema = z.object({
  intent: z.literal("edit-comment"),
  commentId: z.coerce.number().int(),
  body: z.string(),
});

export const saveNoteSchema = z.object({ body: noteBodySchema });

export const submitQuizSchema = z.object({
  quizId: z.coerce.number().int().positive(),
});

// One "question-{questionId}" field whose value is the chosen option id.
export const quizAnswerSchema = z.object({
  questionId: z.coerce.number().int().positive(),
  optionId: z.coerce.number().int().positive(),
});

export const deleteCommentSchema = z.object({
  intent: z.literal("delete-comment"),
  commentId: z.coerce.number().int(),
});

/**
 * What each action intent needs: comments, Bookmarks and Notes need view;
 * progress and quizzes need take. Moderating Discussions (deleting someone
 * else's post) additionally needs manage, checked in the delete intent.
 */
export const INTENT_CAPABILITY: Record<string, Capability | undefined> = {
  "create-comment": "view",
  "edit-comment": "view",
  "delete-comment": "view",
  "toggle-bookmark": "view",
  "save-note": "view",
  "mark-complete": "take",
  "submit-quiz": "take",
};
