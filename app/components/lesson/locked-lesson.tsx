import { Link } from "react-router";
import { MapPin, ShieldAlert } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { countryName } from "~/lib/ppp";
import type { DenialReason } from "~/modules/permissions/course-permissions.server";
import { CurriculumSidebar } from "./curriculum-sidebar";

export function LockedLesson({
  data: { course, curriculum, module: mod, lesson, enrolled, lockedReason },
}: {
  data: {
    course: { id: number; title: string; slug: string };
    curriculum: Parameters<typeof CurriculumSidebar>[0]["curriculum"];
    module: { id: number; title: string };
    lesson: { id: number; title: string };
    enrolled: boolean;
    lockedReason: DenialReason;
  };
}) {
  const purchasePath = `/courses/${course.slug}/purchase`;

  return (
    <div className="flex">
      <CurriculumSidebar
        course={course}
        curriculum={curriculum}
        currentLessonId={lesson.id}
        lessonProgressMap={{}}
        enrolled={enrolled}
      />

      <div className="flex-1 p-6 lg:p-8">
        <LessonBreadcrumb
          course={course}
          mod={mod}
          lessonTitle={lesson.title}
        />

        <div className="mx-auto max-w-4xl">
          <h1 className="mb-6 text-3xl font-bold">{lesson.title}</h1>

          <Card className="mb-8">
            <CardContent className="py-10 text-center">
              {lockedReason.kind === "country-lock" ? (
                <>
                  <ShieldAlert className="mx-auto mb-4 size-12 text-amber-500" />
                  <h2 className="mb-3 text-xl font-semibold">Country Lock</h2>
                  <p className="mb-4 text-muted-foreground">
                    You bought this course at a Purchasing-Power Price in{" "}
                    <strong>{countryName(lockedReason.purchaseCountry)}</strong>
                    , but you're currently in{" "}
                    <strong>{countryName(lockedReason.currentCountry)}</strong>.
                  </p>
                  <p className="mb-6 text-sm text-muted-foreground">
                    A course bought at a Purchasing-Power Price only works from
                    the country it was bought in. This helps keep courses
                    affordable for students in lower-income regions.
                  </p>
                  <Link to={`/courses/${course.slug}`}>
                    <Button variant="outline">
                      <MapPin className="mr-2 size-4" />
                      Back to Course
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <h2 className="mb-3 text-xl font-semibold">
                    Buy this course to watch this lesson
                  </h2>
                  <p className="mb-6 text-muted-foreground">
                    This lesson is part of <strong>{course.title}</strong>.
                    Enroll to get the full lesson, its video and every other
                    lesson in the course.
                  </p>
                  <Link
                    to={
                      lockedReason.kind === "signed-out"
                        ? `/signup?redirectTo=${encodeURIComponent(purchasePath)}`
                        : purchasePath
                    }
                  >
                    <Button size="lg">Buy the course</Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function LessonBreadcrumb({
  course,
  mod,
  lessonTitle,
}: {
  course: { title: string; slug: string };
  mod: { id: number; title: string };
  lessonTitle: string;
}) {
  return (
    <nav className="mb-6 text-sm text-muted-foreground">
      <Link to="/courses" className="hover:text-foreground">
        Courses
      </Link>
      <span className="mx-2">/</span>
      <Link to={`/courses/${course.slug}`} className="hover:text-foreground">
        {course.title}
      </Link>
      <span className="mx-2">/</span>
      <Link
        to={`/courses/${course.slug}/${mod.id}`}
        className="hover:text-foreground"
      >
        {mod.title}
      </Link>
      <span className="mx-2">/</span>
      <span className="text-foreground">{lessonTitle}</span>
    </nav>
  );
}
