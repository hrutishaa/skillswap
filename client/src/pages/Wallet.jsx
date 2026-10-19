import { useData } from '../lib/app.jsx'
import { when, KIND_LABEL } from '../lib/format.js'

function Stat({ label, value, hint, testid }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-3xl font-extrabold" data-testid={testid}>{value} <span className="text-base text-ember-600">CR</span></div>
      <div className="mt-1 text-xs text-ink-500">{hint}</div>
    </div>
  )
}

export default function WalletPage() {
  const { data: w } = useData('/wallet')
  if (!w) return null
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Wallet</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Available" value={w.balance} hint="Spendable right now" testid="wallet-balance" />
        <Stat label="In escrow" value={w.held} hint="Held for sessions you booked" testid="wallet-held" />
        <Stat label="Incoming" value={w.incoming} hint="From confirmed sessions you teach" testid="wallet-incoming" />
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-cream-200 px-5 py-3 font-extrabold">Ledger</div>
        <table className="w-full text-sm" data-testid="ledger">
          <thead className="bg-cream-50 text-left text-xs uppercase text-ink-500">
            <tr><th className="px-5 py-2">When</th><th className="px-5 py-2">What</th><th className="px-5 py-2 text-right">Amount</th><th className="px-5 py-2 text-right">Balance</th></tr>
          </thead>
          <tbody>
            {w.entries.map(e => (
              <tr key={e.id} className="border-t border-cream-100">
                <td className="whitespace-nowrap px-5 py-2 text-ink-500">{when(e.createdAt)}</td>
                <td className="px-5 py-2"><span className="font-semibold">{KIND_LABEL[e.kind] || e.kind}</span> <span className="text-ink-500">{e.memo}</span></td>
                <td className={`px-5 py-2 text-right font-bold ${e.amount > 0 ? 'text-emerald-700' : 'text-ink-700'}`}>{e.amount > 0 ? '+' : ''}{e.amount}</td>
                <td className="px-5 py-2 text-right">{e.balanceAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500">
        Every change to a balance is a row here, and every row has a matching entry on the other side (escrow, another student, or the bonus pool), so the totals always add up.
      </p>
    </div>
  )
}
