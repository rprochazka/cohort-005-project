import { useEffect } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/courses.$slug.lessons.$lessonId";
import {
  coursePermissions,
  type CourseRef,
  type DenialReason,
} from "~/modules/permissions/course-permissions.server";
import {
  createComment,
  deleteComment,
  editComment,
} from "~/lib/comments.server";
import { defaultNotifications } from "~/lib/notifications.server";
import { isBookmarked, toggleBookmark } from "~/lib/bookmarks.server";
import { getNote, saveNote } from "~/lib/notes.server";
import { CommentThread } from "~/components/comment-thread";
import { db } from "~/db";
import { quizzes, LessonProgressStatus } from "~/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { LessonNote } from "~/components/lesson-note";
import { Clock, Github } from "lucide-react";
import { formatDuration } from "~/lib/utils";
import { renderMarkdown } from "~/lib/markdown.server";
import { YouTubePlayer } from "~/components/youtube-player";
import { data } from "react-router";
import { parseFormData } from "~/lib/validation";
import {
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
  flattenCourseLessons,
} from "~/modules/lesson-viewer/course.server";
import {
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
  getLastWatchPosition,
  calculateWatchProgress,
} from "~/modules/lesson-viewer/progress.server";
import {
  getCommentById,
  getLessonThread,
  renderThread,
} from "~/modules/lesson-viewer/thread.server";
import {
  getQuizByLessonId,
  getQuizWithQuestions,
  getBestAttempt,
  computeResult,
} from "~/modules/lesson-viewer/quiz.server";
import {
  createCommentSchema,
  editCommentSchema,
  saveNoteSchema,
  deleteCommentSchema,
  INTENT_CAPABILITY,
} from "~/modules/lesson-viewer/schemas";
import { CurriculumSidebar } from "~/components/lesson/curriculum-sidebar";
import { QuizSection } from "~/components/lesson/quiz-section";
import {
  LockedLesson,
  LessonBreadcrumb,
} from "~/components/lesson/locked-lesson";
import { BookmarkToggle } from "~/components/lesson/bookmark-toggle";
import { useAutoplay } from "~/components/lesson/use-autoplay";
import { LessonError } from "~/components/lesson/lesson-error";
import { LessonPager } from "~/components/lesson/lesson-pager";
import { LessonCompletion } from "~/components/lesson/lesson-completion";

/**
 * The course named by this route's slug, through this lesson. A lesson in
 * another course, or a malformed lesson id, counts as not found.
 */
function lessonRef(params: { slug: string; lessonId: string }): CourseRef {
  return { slug: params.slug, lessonId: params.lessonId };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.lesson?.title ?? "Lesson";
  const courseTitle = loaderData?.course?.title ?? "Course";
  return [{ title: `${title} — ${courseTitle} — Cadence` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  // Not found covers an unknown course, a malformed lesson id, and a lesson
  // from another course.
  const decisions = await coursePermissions.getCourseDecisions(
    request,
    lessonRef(params)
  );
  if (!decisions.found) {
    throw data("Lesson not found", { status: 404 });
  }

  const { course, person, enrolled, view, take, manage } = decisions;
  const currentUserId = person?.id ?? null;
  const lessonId = Number(params.lessonId);

  const courseWithDetails = getCourseWithDetails(course.id);
  const lesson = getLessonById(lessonId);
  const mod = lesson ? getModuleById(lesson.moduleId) : undefined;
  if (!courseWithDetails || !lesson || !mod) {
    throw data("Lesson not found", { status: 404 });
  }

  const curriculum = courseWithDetails.modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => ({
      id: l.id,
      title: l.title,
    })),
  }));

  // Someone who can't view the content gets the lesson's title, its module and
  // the course outline — never the body, video or quiz — plus the reason, so
  // the page can show the right call to action.
  if (!view.allowed) {
    const lockedReason: DenialReason = view.reason;

    return {
      view: "locked" as const,
      course: {
        id: courseWithDetails.id,
        title: courseWithDetails.title,
        slug: courseWithDetails.slug,
      },
      curriculum,
      module: { id: mod.id, title: mod.title },
      lesson: { id: lesson.id, title: lesson.title },
      enrolled,
      lockedReason,
    };
  }

  let lessonStatus: string | null = null;
  let lastWatchPosition = 0;
  let watchProgress = 0;
  const lessonProgressMap: Record<number, string> = {};

  if (currentUserId) {
    // Progress is recorded only for people who can take the course, so a
    // Student under a Country Lock gets none.
    if (take.allowed) {
      // Mark lesson as in-progress when viewed
      markLessonInProgress(currentUserId, lessonId);
      const progress = getLessonProgress(currentUserId, lessonId);
      lessonStatus = progress?.status ?? null;

      // Get progress for all lessons in course (for curriculum sidebar)
      const progressRecords = getLessonProgressForCourse(
        currentUserId,
        course.id
      );
      for (const record of progressRecords) {
        lessonProgressMap[record.lessonId] = record.status;
      }

      // Get video watch state for resume and progress display
      if (lesson.videoUrl) {
        lastWatchPosition = getLastWatchPosition(currentUserId, lessonId);
        const videoDurationSeconds = (lesson.durationMinutes ?? 0) * 60;
        if (videoDurationSeconds > 0) {
          watchProgress = calculateWatchProgress(
            currentUserId,
            lessonId,
            videoDurationSeconds
          );
        }
      }
    }
  }

  // Everything from here on is behind the can-view-content bar above:
  // comments, Bookmarks and Notes are confidential to the course.
  const instructor = getUserById(course.instructorId);
  const comments = await renderThread(getLessonThread(lessonId));

  const bookmarked = currentUserId
    ? isBookmarked(db, currentUserId, lessonId)
    : false;
  const note = currentUserId ? getNote(db, currentUserId, lessonId) : undefined;

  // Render lesson content from Markdown to HTML server-side
  const contentHtml = lesson.content
    ? await renderMarkdown(lesson.content)
    : null;

  // Build prev/next navigation
  const allLessons = flattenCourseLessons(courseWithDetails);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  // Check for quiz attached to this lesson
  const quizRecord = getQuizByLessonId(lessonId);
  let quiz: {
    id: number;
    title: string;
    passingScore: number;
    questions: Array<{
      id: number;
      questionText: string;
      questionType: string;
      position: number;
      options: Array<{ id: number; optionText: string }>;
    }>;
  } | null = null;
  let bestAttempt: { score: number; passed: boolean } | null = null;

  if (quizRecord) {
    const quizData = getQuizWithQuestions(quizRecord.id);
    if (quizData) {
      // Strip isCorrect from options so answers aren't leaked to the client
      quiz = {
        id: quizData.id,
        title: quizData.title,
        passingScore: quizData.passingScore,
        questions: quizData.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          position: q.position,
          options: q.options.map((o) => ({
            id: o.id,
            optionText: o.optionText,
          })),
        })),
      };
    }

    if (currentUserId) {
      const best = getBestAttempt(currentUserId, quizRecord.id);
      if (best) {
        bestAttempt = { score: best.score, passed: best.passed };
      }
    }
  }

  return {
    view: "full" as const,
    course: {
      id: courseWithDetails.id,
      title: courseWithDetails.title,
      slug: courseWithDetails.slug,
    },
    curriculum,
    module: {
      id: mod.id,
      title: mod.title,
    },
    lesson,
    contentHtml,
    lessonStatus,
    enrolled,
    currentUserId,
    prevLesson,
    nextLesson,
    quiz,
    bestAttempt,
    lastWatchPosition,
    watchProgress,
    lessonProgressMap,
    comments,
    canModerate: manage.allowed,
    instructorName: instructor?.name ?? "your instructor",
    bookmarked,
    note: note ? { body: note.body, updatedAt: note.updatedAt } : null,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Every intent checks its own capability here — loader guards don't protect
  // actions. The ref includes the lesson, so a lesson from another course (or
  // a malformed id) is a 404.
  const capability =
    typeof intent === "string" ? INTENT_CAPABILITY[intent] : undefined;
  if (!capability) {
    throw data("Invalid action", { status: 400 });
  }
  const ref = lessonRef(params);
  const { person } = await coursePermissions.requireCapability(
    request,
    capability,
    ref
  );
  const currentUserId = person.id;
  const lessonId = Number(params.lessonId);

  if (
    intent === "create-comment" ||
    intent === "edit-comment" ||
    intent === "delete-comment"
  ) {
    try {
      if (intent === "create-comment") {
        const parsed = parseFormData(formData, createCommentSchema);
        if (!parsed.success) {
          return { ok: false, error: "Enter a comment before posting." };
        }
        const created = await createComment(
          db,
          currentUserId,
          lessonId,
          parsed.data.parentId ?? null,
          parsed.data.body,
          new Date(),
          await defaultNotifications()
        );
        if (!created.ok) return created;
        return { ok: true };
      }

      if (intent === "edit-comment") {
        const parsed = parseFormData(formData, editCommentSchema);
        if (!parsed.success) {
          return { ok: false, error: "Enter a comment before saving." };
        }
        // Scope the id to this lesson so a comment elsewhere can't be reached
        // by posting its id to this route.
        const existing = getCommentById(parsed.data.commentId);
        if (!existing || existing.lessonId !== lessonId) {
          throw data("Comment not found", { status: 404 });
        }
        const edited = editComment(
          db,
          parsed.data.commentId,
          currentUserId,
          parsed.data.body,
          new Date()
        );
        if (!edited.ok) return edited;
        return { ok: true };
      }

      const parsed = parseFormData(formData, deleteCommentSchema);
      if (!parsed.success) {
        return { ok: false, error: "Could not delete that comment." };
      }
      const existing = getCommentById(parsed.data.commentId);
      if (!existing || existing.lessonId !== lessonId) {
        throw data("Comment not found", { status: 404 });
      }
      // Anyone who can view may delete their own posts; moderating someone
      // else's takes the manage capability.
      const decisions = coursePermissions.decide(person, ref);
      const canModerate = decisions.found && decisions.manage.allowed;
      const deleted = await deleteComment(
        db,
        parsed.data.commentId,
        currentUserId,
        canModerate,
        new Date(),
        await defaultNotifications()
      );
      if (!deleted.ok) return deleted;
      return { ok: true };
    } catch (error) {
      // Service validation failures are user-correctable; anything thrown as a
      // Response (404 above) should keep bubbling.
      if (error instanceof Error) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  }

  if (intent === "toggle-bookmark" || intent === "save-note") {
    if (intent === "toggle-bookmark") {
      const bookmarked = toggleBookmark(
        db,
        currentUserId,
        lessonId,
        new Date()
      );
      return { ok: true, bookmarked };
    }

    const parsed = parseFormData(formData, saveNoteSchema);
    if (!parsed.success) {
      return { ok: false, error: parsed.errors.body };
    }
    const saved = saveNote(
      db,
      currentUserId,
      lessonId,
      parsed.data.body,
      new Date()
    );
    if (!saved.ok) return saved;
    return { ok: true };
  }

  if (intent === "mark-complete") {
    markLessonComplete(currentUserId, lessonId);
    return { success: true };
  }

  if (intent === "submit-quiz") {
    const quizId = Number(formData.get("quizId"));
    if (isNaN(quizId)) {
      throw data("Invalid quiz ID", { status: 400 });
    }
    // Scope the quiz to this lesson so a quiz elsewhere can't be reached by
    // posting its id to this route.
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz || quiz.lessonId !== lessonId) {
      throw data("Quiz not found", { status: 404 });
    }

    // Collect answers: form fields named "question-{questionId}" with value = optionId
    const selectedAnswers: Record<number, number> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("question-")) {
        const questionId = Number(key.replace("question-", ""));
        const optionId = Number(value);
        if (!isNaN(questionId) && !isNaN(optionId)) {
          selectedAnswers[questionId] = optionId;
        }
      }
    }

    const result = computeResult(currentUserId, quizId, selectedAnswers);
    if (!result) {
      throw data("Failed to score quiz", { status: 500 });
    }

    return { quizResult: result };
  }

  throw data("Invalid action", { status: 400 });
}

type LessonLoaderData = Route.ComponentProps["loaderData"];

export default function LessonViewer({ loaderData }: Route.ComponentProps) {
  if (loaderData.view === "locked") {
    return <LockedLesson data={loaderData} />;
  }
  return <FullLesson data={loaderData} />;
}

function FullLesson({
  data,
}: {
  data: Extract<LessonLoaderData, { view: "full" }>;
}) {
  const {
    course,
    curriculum,
    module: mod,
    lesson,
    contentHtml,
    lessonStatus,
    enrolled,
    currentUserId,
    prevLesson,
    nextLesson,
    quiz,
    bestAttempt,
    lastWatchPosition,
    watchProgress,
    lessonProgressMap,
    comments,
    canModerate,
    instructorName,
    bookmarked,
    note,
  } = data;
  const [autoplay, toggleAutoplay] = useAutoplay();
  const fetcher = useFetcher({ key: `mark-complete-${lesson.id}` });
  const quizFetcher = useFetcher({ key: `quiz-${lesson.id}` });
  const navigate = useNavigate();

  const isMarking =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "mark-complete";

  const justCompleted = fetcher.data?.success;

  const isCompleted =
    lessonStatus === LessonProgressStatus.Completed || justCompleted;

  // Navigate to next lesson after marking complete
  useEffect(() => {
    if (justCompleted && nextLesson) {
      navigate(`/courses/${course.slug}/lessons/${nextLesson.id}`);
    }
  }, [justCompleted, nextLesson, course.slug, navigate]);

  const quizResult = quizFetcher.data?.quizResult ?? null;
  const isSubmittingQuiz = quizFetcher.state !== "idle";

  return (
    <div className="flex">
      {/* Curriculum Sidebar */}
      <CurriculumSidebar
        course={course}
        curriculum={curriculum}
        currentLessonId={lesson.id}
        lessonProgressMap={lessonProgressMap}
        enrolled={enrolled}
      />

      <div className="flex-1 p-6 lg:p-8">
        <LessonBreadcrumb
          course={course}
          mod={mod}
          lessonTitle={lesson.title}
        />

        <div className="mx-auto max-w-4xl">
          {/* Lesson Title */}
          <div className="mb-2 flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold">{lesson.title}</h1>
            {currentUserId && <BookmarkToggle bookmarked={bookmarked} />}
          </div>
          <div className="mb-6 flex items-center gap-3">
            {lesson.durationMinutes && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="size-4" />
                {formatDuration(lesson.durationMinutes, true, false, false)}
              </div>
            )}
            {lesson.githubRepoUrl && (
              <a
                href={lesson.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm">
                  <Github className="mr-1.5 size-4" />
                  Open Code
                </Button>
              </a>
            )}
          </div>

          {/* YouTube Video */}
          {lesson.videoUrl && (
            <YouTubePlayer
              videoUrl={lesson.videoUrl}
              lessonId={lesson.id}
              title={lesson.title}
              startPosition={lastWatchPosition}
              durationMinutes={lesson.durationMinutes}
              watchProgress={watchProgress}
              trackingEnabled={enrolled && !!currentUserId}
              autoplay={autoplay}
              onToggleAutoplay={toggleAutoplay}
            />
          )}

          {/* Note — under the video, so the Student can write while they watch */}
          {currentUserId && <LessonNote key={lesson.id} note={note} />}

          {/* Lesson Content */}
          {contentHtml && (
            <div
              className="prose prose-neutral dark:prose-invert mb-8 max-w-none"
              // oxlint-disable-next-line react/no-danger -- the instructor wrote this Markdown
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          )}

          {!contentHtml && !lesson.videoUrl && (
            <Card className="mb-8">
              <CardContent className="py-12 text-center text-muted-foreground">
                No content has been added to this lesson yet.
              </CardContent>
            </Card>
          )}

          {/* Quiz Section */}
          {quiz && enrolled && currentUserId && (
            <QuizSection
              quiz={quiz}
              bestAttempt={bestAttempt}
              quizResult={quizResult}
              quizFetcher={quizFetcher}
              isSubmitting={isSubmittingQuiz}
            />
          )}

          {/* Mark Complete / Up Next */}
          {enrolled && currentUserId && (
            <LessonCompletion
              fetcher={fetcher}
              isCompleted={!!isCompleted}
              isMarking={isMarking}
              courseSlug={course.slug}
              nextLesson={nextLesson}
            />
          )}

          {/* Questions & Discussion — confidential to people with access */}
          <CommentThread
            comments={comments}
            currentUserId={currentUserId}
            canModerate={canModerate}
            canPost
            instructorName={instructorName}
          />

          <LessonPager
            course={course}
            prevLesson={prevLesson}
            nextLesson={nextLesson}
          />
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <LessonError error={error} />;
}
