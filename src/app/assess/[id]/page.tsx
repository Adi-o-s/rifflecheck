import type { Metadata } from "next";
import { AssessmentWizard } from "@/components/AssessmentWizard";

export const metadata: Metadata = { title: "Assessment · RiffleCheck" };

export default async function AssessPage({ params }: PageProps<"/assess/[id]">) {
  const { id } = await params;
  return (
    <div className="page">
      <AssessmentWizard key={id} id={id} />
    </div>
  );
}
