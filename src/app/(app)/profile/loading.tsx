import {
  Card,
  Dot,
  Heading,
  Line,
  LoadingPage,
  PageHeader,
  Paragraph,
} from "@/components/skeletons/kit";

/** You: the plan, what it recalculated, Momo's AI, history, switches, data. */
export default function Loading() {
  return (
    <LoadingPage>
      <PageHeader momo meta />

      <Card className="h-[1449px] sm:h-[715px]">
        <Heading />
        <div className="space-y-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i}>
              <Line className="h-3 w-28" />
              <Line className="mt-2 h-12 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="h-[553px]">
        <Heading />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Line key={i} className="h-20 w-full rounded-3xl" />
          ))}
        </div>
      </Card>

      <Card className="h-[406px] sm:h-[345px]">
        <Heading />
        <Paragraph lines={3} />
        <Line className="mt-4 h-12 w-full rounded-2xl" />
      </Card>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Card className="h-[142px] sm:h-[153px]">
          <Heading hint={false} />
          <Paragraph lines={1} />
        </Card>
        <Card className="h-[598px] sm:h-[580px]">
          <Heading hint={false} />
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Dot size={24} className="rounded-full" />
                <Line className="h-3.5 w-36" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="h-[219px] sm:h-[163px]">
        <Heading hint={false} />
        <Line className="h-14 w-full rounded-2xl" />
      </Card>
    </LoadingPage>
  );
}
