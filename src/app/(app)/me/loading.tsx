import { PageSkeleton } from "@/components/skeleton";

// Keeps the Me tab bar in place while switching between self-service tabs.
export default function Loading() {
  return <PageSkeleton stats={3} rows={4} />;
}
