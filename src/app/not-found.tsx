import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-slate-800">That address does not exist in RiffleCheck.</p>
      <Link
        href="/"
        className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800"
      >
        Back to home
      </Link>
    </section>
    </div>
  );
}
