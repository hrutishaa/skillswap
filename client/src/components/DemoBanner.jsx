import { useState } from 'react'
import { X } from 'lucide-react'
import { DEMO, REPO_URL } from '../config.js'

export default function DemoBanner() {
  const [hidden, setHidden] = useState(sessionStorage.getItem('skillswap-banner') === 'hidden')
  if (!DEMO || hidden) return null
  const reset = async () => {
    const { resetDemo } = await import('../demo/backend.js')
    resetDemo()
    location.reload()
  }
  return (
    <div className="bg-ink-900 text-cream-100 text-xs" data-testid="demo-banner">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <p className="flex-1">
          Demo mode. There is no server here: the API runs in your browser and data is saved in localStorage.
          For a video call, open this page in a second tab and log in as the other demo user.
          The full version with Node and Postgres is on <a className="underline" href={REPO_URL}>GitHub</a>.
        </p>
        <button onClick={reset} className="rounded-md border border-cream-100/30 px-2 py-0.5 hover:bg-white/10">Reset data</button>
        <button onClick={() => { sessionStorage.setItem('skillswap-banner', 'hidden'); setHidden(true) }} aria-label="Hide"><X size={14} /></button>
      </div>
    </div>
  )
}
