import { z } from "zod";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import type { Capability } from "~/modules/permissions/course-permissions.server";

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

export const saveNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something before saving your note.")
    .max(
      MAX_NOTE_LENGTH,
      `Your note is over ${MAX_NOTE_LENGTH.toLocaleString("en")} characters, so it was not saved.`
    ),
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
