export default function Loading() {
  return (
    <section className="app-container py-12">
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-xl border border-white/[0.075] bg-[#090d16]" />
        ))}
      </div>
    </section>
  );
}
