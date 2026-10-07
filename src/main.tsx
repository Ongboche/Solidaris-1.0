import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import './i18n'
import './index.css'
import i18n from './i18n'
import { AuthProvider } from './app/auth'
import { router } from './app/router'
import { isSupabaseConfigured } from './lib/supabase'

const queryClient = new QueryClient({
  defaultOptions: {
    // Slow connections: retry a few times, back off, and don't refetch on every focus.
    queries: { retry: 3, staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert">{i18n.t('errors.configMissing')}</p>
      </main>
    )}
  </StrictMode>,
)
