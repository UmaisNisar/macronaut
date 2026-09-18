import {
  Card,
  Dot,
  Heading,
  Line,
  LoadingPage,
  MeterRow,
  PageHeader,
  Paragraph,
} from "@/components/skeletons/kit";

/**
 * Today, before its numbers arrive.
 *
 * The heights are the real cards' heights, measured at both widths, so the
 * page that replaces this one starts every card in the same place.
 */
export default function Loading() {
  return (
    <LoadingPage>
      <PageHeader momo lines={2} />

      {/* Weigh-in bar. */}
      <Card inset={false} className="flex h-16 items-center gap-3 px-4">
        <Dot size={22} className="rounded-lg" />
        <Line className="h-3.5 w-32" />
        <Line className="ml-auto h-3 w-16" />
      </Card>

      {/* The jar, the verdict chip, the score and the macro meters. */}
      <Card className="flex h-[721px] flex-col items-center sm:h-[425px]">
        <Dot size={236} className="rounded-full sm:!h-[168px] sm:!w-[168px]" />
        <Line className="mt-5 h-8 w-36 rounded-full" />
        <div className="mt-6 w-full space-y-4">
          <MeterRow />
          <MeterRow />
          <MeterRow />
        </div>
      </Card>

      {/* The composer. */}
      <Card className="h-[329px] sm:h-[241px]">
        <Line className="h-4 w-48 max-w-full" />
        <Line className="mt-4 h-24 w-full rounded-2xl sm:h-16" />
        <Line className="mt-4 h-11 w-40 rounded-full" />
      </Card>

      {/* Momo's prompt. */}
      <Card className="flex h-[209px] items-start gap-3 sm:h-[134px]">
        <Dot size={48} className="rounded-full" />
        <div className="min-w-0 flex-1">
          <Line className="h-4 w-44 max-w-full" />
          <div className="mt-3">
            <Paragraph lines={2} />
          </div>
        </div>
      </Card>

      {/* Today's plate. */}
      <Card className="h-[318px] sm:h-[327px]">
        <Heading />
        <Paragraph lines={2} />
      </Card>

      {/* The week as one budget: seven bars on a baseline. */}
      <Card className="h-[421px] sm:h-[409px]">
        <Heading />
        <div className="flex h-24 items-end gap-2">
          {[52, 78, 41, 96, 63, 30, 70].map((h, i) => (
            <span
              key={i}
              aria-hidden
              className="skeleton w-full rounded-t-xl"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </Card>
    </LoadingPage>
  );
}
