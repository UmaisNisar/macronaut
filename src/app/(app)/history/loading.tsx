import {
  Card,
  Heading,
  Line,
  LoadingPage,
  PageHeader,
  Paragraph,
} from "@/components/skeletons/kit";

/** The Journal: a calendar and the jump list, beside the day you picked. */
export default function Loading() {
  return (
    <LoadingPage>
      <PageHeader />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="h-[511px] lg:h-[489px]">
            <Line className="mx-auto h-4 w-40" />
            {/* Six rows of seven days. */}
            <div className="mt-5 grid grid-cols-7 gap-2">
              {Array.from({ length: 42 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="skeleton aspect-square w-full rounded-xl"
                />
              ))}
            </div>
          </Card>
          <Card className="h-[165px] lg:h-[222px]">
            <Heading hint={false} />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Line key={i} className="h-9 w-24 rounded-full" />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <Card className="h-[360px] lg:h-[274px]">
            <Heading />
            <Paragraph lines={3} />
          </Card>
          <Card className="h-20 lg:h-[68px]">
            <Line className="h-3.5 w-44 max-w-full" />
          </Card>
        </div>
      </div>
    </LoadingPage>
  );
}
