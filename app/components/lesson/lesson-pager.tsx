import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PagerLesson = { id: number; title: string };

export function LessonPager({
  course,
  prevLesson,
  nextLesson,
}: {
  course: { title: string; slug: string };
  prevLesson: PagerLesson | null;
  nextLesson: PagerLesson | null;
}) {
  const lessonPath = (lesson: PagerLesson) =>
    `/courses/${course.slug}/lessons/${lesson.id}`;

  return (
    <div className="flex items-center justify-between border-t pt-6">
      {prevLesson ? (
        <PagerLink
          to={lessonPath(prevLesson)}
          label="Previous"
          title={prevLesson.title}
          back
        />
      ) : (
        <div />
      )}

      {nextLesson ? (
        <PagerLink
          to={lessonPath(nextLesson)}
          label="Next"
          title={nextLesson.title}
          alignRight
        />
      ) : (
        <PagerLink
          to={`/courses/${course.slug}`}
          label="Back to"
          title={course.title}
        />
      )}
    </div>
  );
}

function PagerLink({
  to,
  label,
  title,
  back = false,
  alignRight = false,
}: {
  to: string;
  label: string;
  title: string;
  back?: boolean;
  alignRight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground${alignRight ? " text-right" : ""}`}
    >
      {back && <ChevronLeft className="size-4" />}
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground">{title}</div>
      </div>
      {!back && <ChevronRight className="size-4" />}
    </Link>
  );
}
