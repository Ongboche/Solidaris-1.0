import type { ReactNode } from 'react'

/**
 * Horizontally scrollable region (wide tables on small screens). Focusable and labelled so
 * keyboard users can scroll it with the arrow keys (WCAG 2.1.1, axe scrollable-region-focusable).
 */
export function ScrollArea({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={`overflow-x-auto ${className}`}>
      {children}
    </div>
  )
}
