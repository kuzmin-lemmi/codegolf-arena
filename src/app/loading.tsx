export default function GlobalLoading() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-background-secondary/40 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-48 rounded bg-background-tertiary" />
          <div className="h-4 w-full rounded bg-background-tertiary" />
          <div className="h-4 w-4/5 rounded bg-background-tertiary" />
          <div className="h-10 w-40 rounded bg-background-tertiary" />
        </div>
      </div>
    </div>
  );
}
