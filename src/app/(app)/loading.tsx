import { Card, Heading, LoadingPage, PageHeader, Paragraph } from "@/components/skeletons/kit";

/**
 * The fallback, for a screen that has no skeleton of its own. Every tab does
 * have one — they sit next to their page and mirror it — so this only stands
 * in for something new.
 */
export default function Loading() {
  return (
    <LoadingPage>
      <PageHeader />
      <Card className="h-64">
        <Heading />
        <Paragraph lines={3} />
      </Card>
      <Card className="h-40">
        <Heading hint={false} />
        <Paragraph lines={2} />
      </Card>
    </LoadingPage>
  );
}
