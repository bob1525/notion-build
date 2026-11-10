export function PageSkeleton({ label = "正在打开页面" }: { label?: string }) {
  return (
    <div data-testid="page-opening" className="mx-auto w-full max-w-[860px] animate-pulse px-4 pt-12 sm:px-10" role="status">
      <p className="text-sm leading-6 text-faint">{label}</p>
      <div className="h-4 w-40 rounded bg-black/[0.05]" />
      <div className="mt-6 h-12 w-12 rounded-lg bg-black/[0.05]" />
      <div className="mt-4 h-10 w-2/3 rounded bg-black/[0.06]" />
      <div className="mt-8 space-y-3">
        <div className="h-4 w-full rounded bg-black/[0.05]" />
        <div className="h-4 w-11/12 rounded bg-black/[0.05]" />
        <div className="h-4 w-4/5 rounded bg-black/[0.04]" />
        <div className="h-24 w-full rounded-md bg-black/[0.04]" />
      </div>
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse px-4 py-12 sm:px-8" role="status">
      <p className="text-sm leading-6 text-faint">正在打开工作区</p>
      <div className="h-10 w-16 rounded bg-black/[0.05]" />
      <div className="mt-4 h-8 w-48 rounded bg-black/[0.06]" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-36 rounded-xl bg-black/[0.04]" />
        ))}
      </div>
    </div>
  )
}
