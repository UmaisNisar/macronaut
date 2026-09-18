import {
  Card,
  Dot,
  Heading,
  Line,
  LoadingPage,
  PageHeader,
} from "@/components/skeletons/kit";

/** The Journey: the path, the weight line, the comparison, the readings. */
export default function Loading() {
  return (
    <LoadingPage>
      <PageHeader />

      {/* The winding path from start to goal. */}
      <Card className="h-[398px] sm:h-[547px]">
        <div className="flex items-center justify-between">
          <Line className="h-3 w-16" />
          <Line className="h-3 w-16" />
        </div>
        <Line className="mt-8 h-3 w-full rounded-full" />
        <div className="mt-8 flex items-center justify-between">
          <Dot size={44} className="rounded-full" />
          <Dot size={44} className="rounded-full" />
        </div>
      </Card>

      {/* The weight line. */}
      <Card className="h-[257px] sm:h-[409px]">
        <Heading />
        <Line className="mt-2 h-24 w-full rounded-2xl sm:h-56" />
      </Card>

      {/* Am I actually improving: three tiles and a table. */}
      <Card className="h-[1229px] sm:h-[914px]">
        <Heading />
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <Line key={i} className="h-24 w-full rounded-3xl" />
          ))}
        </div>
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Line key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>

      {/* Weigh-ins. */}
      <Card className="h-[1183px] sm:h-[1193px]">
        <Heading />
        <div className="space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Dot size={38} className="rounded-2xl" />
              <Line className="h-3.5 w-28" />
              <Line className="ml-auto h-3.5 w-14" />
            </div>
          ))}
        </div>
      </Card>
    </LoadingPage>
  );
}
