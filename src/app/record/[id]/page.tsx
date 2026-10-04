import type { Metadata } from "next";
import { RecordView } from "@/components/RecordView";

export const metadata: Metadata = { title: "Record · RiffleCheck" };

export default async function RecordPage({ params }: PageProps<"/record/[id]">) {
  const { id } = await params;
  return <RecordView id={id} />;
}
