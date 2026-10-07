import type { ReactNode } from 'react'

export function AuthCard({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 rounded border border-line bg-panel p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {intro && <p className="text-muted">{intro}</p>}
      </div>
      {children}
    </div>
  )
}
