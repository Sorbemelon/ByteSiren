import Image from "next/image";

const symbols = ["BTC", "ETH", "BNB", "SOL", "XRP"];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/bytesiren_logo_transparent.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0"
          />
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-slate-100">
              ByteSiren
            </h1>
            <p className="text-sm text-slate-400">
              AI Crypto Market Intelligence
            </p>
          </div>
        </div>
        <div className="w-fit rounded-full border border-violet-500/50 px-3 py-1 text-xs font-medium text-violet-200">
          Read-only &middot; Not financial advice
        </div>
      </header>

      <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section
          aria-label="Chart placeholder"
          className="rounded-2xl border border-slate-700/50 bg-[var(--bg-panel)] p-4 shadow-xl shadow-black/20"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                Chart Panel
              </h2>
              <p className="text-xs text-slate-500">
                Chart symbol only &middot; Intelligence Feed shows all detected
                market events
              </p>
            </div>
            <div className="flex gap-2" aria-label="Chart symbols">
              {symbols.map((symbol, index) => (
                <button
                  key={symbol}
                  type="button"
                  className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                    index === 0
                      ? "border-violet-400 bg-violet-500/15 text-violet-100"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-slate-200">BTCUSDT</p>
            <p className="mt-1 text-xs text-slate-500">
              15m Change placeholder &middot; 24h Change placeholder
            </p>
          </div>

          <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40">
            <p className="text-sm text-slate-500">
              TradingView chart placeholder
            </p>
          </div>
        </section>

        <aside
          aria-label="Intelligence Feed placeholder"
          className="rounded-2xl border border-slate-700/50 bg-[var(--bg-panel)] p-4 shadow-xl shadow-black/20"
        >
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-100">
              Intelligence Feed
            </h2>
            <p className="text-xs text-slate-500">
              Past 30 days &middot; newest first
            </p>
          </div>

          <div className="grid grid-cols-[0.9fr_1.4fr_0.7fr] gap-2 border-b border-slate-800 pb-2 text-xs font-semibold text-slate-400">
            <span>Evidence</span>
            <span>Claude Brief</span>
            <span>Sources</span>
          </div>

          <div className="mt-3 space-y-3">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="grid min-h-28 grid-cols-[0.9fr_1.4fr_0.7fr] gap-2 rounded-xl border border-slate-800 bg-[var(--bg-row)] p-3"
              >
                <div className="space-y-2">
                  <div className="h-3 w-20 rounded bg-slate-700/70" />
                  <div className="h-3 w-24 rounded bg-slate-800" />
                  <div className="h-3 w-16 rounded bg-slate-800" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-28 rounded bg-violet-500/25" />
                  <div className="h-3 w-full rounded bg-slate-800" />
                  <div className="h-3 w-3/4 rounded bg-slate-800" />
                </div>
                <div className="flex flex-wrap content-start gap-2">
                  <span className="h-6 w-12 rounded-full border border-slate-700" />
                  <span className="h-6 w-12 rounded-full border border-slate-700" />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
