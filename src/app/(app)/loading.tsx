import { PageSkeleton } from "@/components/skeleton";

// Prefetched with every sidebar link, so navigation paints this instantly while the page renders on the server.
export default function Loading() {
  return <PageSkeleton />;
}
