import {
  Card,
  Dot,
  Heading,
  Line,
  LoadingPage,
  PageHeader,
  Paragraph,
} from "@/components/skeletons/kit";

/** Insights: period chips, the recap, the numbers, sugar, streaks, stickers. */
export default function Loading() {
  return (
    <LoadingPage>
      <PageHeader />

      {/* This week · 2 weeks · This month */}
      <div className="flex h-10 flex-wrap gap-2">
        <Line className="h-10 w-28 rounded-full" />
        <Line className="h-10 w-24 rounded-full" />
        <Line className="h-10 w-28 rounded-full" />
      </div>

      <Card className="flex h-[151px] items-start gap-3 sm:h-[159px]">
        <Dot size={48} className="rounded-full" />
        <div className="min-w-0 flex-1">
          <Line className="h-4 w-44 max-w-full" />
          <div className="mt-3">
            <Paragraph lines={2} />
          </div>
        </div>
      </Card>

      <Card className="h-[542px] sm:h-[363px]">
        <Heading />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Line key={i} className="h-20 w-full rounded-3xl" />
          ))}
        </div>
        <Line className="mt-5 h-24 w-full rounded-3xl" />
      </Card>

      <Card className="h-[615px] sm:h-[561px]">
        <Heading />
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Dot size={32} className="rounded-xl" />
              <Line className="h-3.5 w-24" />
              <Line className="ml-auto h-3 w-12" />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card className="h-[402px] sm:h-[413px]">
          <Heading hint={false} />
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Line key={i} className="h-24 w-full rounded-3xl" />
            ))}
          </div>
        </Card>
        <Card className="h-[1315px] sm:h-[898px]">
          <Heading />
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => (
              <Line key={i} className="h-24 w-full rounded-3xl" />
            ))}
          </div>
        </Card>
      </div>
    </LoadingPage>
  );
}
