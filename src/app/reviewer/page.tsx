import type { Metadata } from "next";
import { ReviewerView } from "@/components/ReviewerView";

export const metadata: Metadata = { title: "Reviewer view · RiffleCheck" };

export default function ReviewerPage() {
  return <ReviewerView />;
}
