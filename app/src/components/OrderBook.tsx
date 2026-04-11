"use client";

import { useState, useEffect } from "react";
import { watchTx } from "@/lib/txWatcher";
import { submitWithToast } from "@/lib/toastStore";
import { CopyButton } from "@/components/CopyButton";
import type { OrderInfo, TokenCurrency } from "@/lib/wallet-rpc";

// Raw shape returned by order_list_all_active (flat, no existing_order_data wrapper)
interface ActiveOrderRaw {
  order_id: string;
  initially_asked: TokenCurrency;
  initially_given: TokenCurrency;
  ask_balance: { atoms: string; decimal: string };
  give_balance: { atoms: string; decimal: string };
  is_own: boolean;
}

function normalizeActiveOrder(o: ActiveOrderRaw): OrderInfo {
  return {
    order_id: o.order_id,
    initially_asked: o.initially_asked,
    initially_given: o.initially_given,
    existing_order_data: {
      ask_balance: o.ask_balance,
      give_balance: o.give_balance,
      creation_timestamp: { timestamp: 0 },
      is_frozen: false,
    },
    is_marked_as_frozen_in_wallet: false,
    is_marked_as_concluded_in_wallet: false,
  };
}

// ── Favourites (shared with TokenSearch) ──────────────────────────────────────

interface FavouriteEntry {
  tokenId: string;
  ticker: string;
}

const FAV_KEY = "ml_favourite_tokens";

function loadFavourites(): FavouriteEntry[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as FavouriteEntry[];
  } catch {
    return [];
  }
}

// ── RPC helper ────────────────────────────────────────────────────────────────

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const data = await res.json() as { ok: boolean; result?: T; error?: { message: string } };
  if (!data.ok) throw new Error(data.error?.message ?? "RPC error");
  return data.result as T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currencyLabel(c: TokenCurrency): string {
  if (c.type === "Coin") return "ML";
  return c.content.id.slice(0, 10) + "…";
}

function currencyAmount(c: TokenCurrency): string {
  return c.content.amount.decimal;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString();
}

/** Price in ML per token unit */
function calcPrice(mlDecimal: string, tokenDecimal: string): string {
  const ml = parseFloat(mlDecimal);
  const tok = parseFloat(tokenDecimal);
  if (!tok || !ml) return "—";
  return (ml / tok).toPrecision(6).replace(/\.?0+$/, "");
}

// ── Buy / Sell panel ──────────────────────────────────────────────────────────

function BuySellPanel({
  selectedTokenId,
  ticker,
  pairAsks,
  pairBids,
  mlBalance,
  tokenBalance,
  onCreated,
  onPairRefresh,
}: {
  selectedTokenId: string | null;
  ticker: string;
  pairAsks: OrderInfo[];
  pairBids: OrderInfo[];
  mlBalance: string | null;
  tokenBalance: string | null;
  onCreated: () => void;
  onPairRefresh: () => void;
}) {
  const [side, setSide]     = useState<"buy" | "sell">("buy");
  const [type, setType]     = useState<"limit" | "market">("limit");
  const [tokenId, setTokenId] = useState(""); // manual token ID when no pair selected
  const [amount, setAmount] = useState("");   // token amount
  const [price, setPrice]   = useState("");   // ML per token (limit only)
  const [mlAmount, setMlAmount] = useState(""); // ML to spend (buy market)
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const effectiveTokenId = selectedTokenId ?? tokenId;
  const effectiveTicker  = selectedTokenId ? ticker : (tokenId ? tokenId.slice(0, 8) + "…" : "TOKEN");

  // Best prices from the loaded pair order book
  const bestAsk = pairAsks[0];
  const bestBid = pairBids[0];

  const bestAskPrice = bestAsk?.existing_order_data
    ? calcPrice(bestAsk.existing_order_data.ask_balance.decimal, bestAsk.existing_order_data.give_balance.decimal)
    : null;
  const bestBidPrice = bestBid?.existing_order_data
    ? calcPrice(bestBid.existing_order_data.give_balance.decimal, bestBid.existing_order_data.ask_balance.decimal)
    : null;

  const totalML = amount && price
    ? (parseFloat(amount) * parseFloat(price)).toPrecision(8).replace(/\.?0+$/, "")
    : "";

  const estTokens = mlAmount && bestAskPrice && bestAskPrice !== "—"
    ? (parseFloat(mlAmount) / parseFloat(bestAskPrice)).toPrecision(6).replace(/\.?0+$/, "")
    : null;

  const estML = amount && bestBidPrice && bestBidPrice !== "—"
    ? (parseFloat(amount) * parseFloat(bestBidPrice)).toPrecision(6).replace(/\.?0+$/, "")
    : null;

  const canSubmit = !loading && !!effectiveTokenId && (
    type === "limit"
      ? (!!amount && !!price && parseFloat(amount) > 0 && parseFloat(price) > 0)
      : side === "buy"
        ? (!!mlAmount && parseFloat(mlAmount) > 0 && !!bestAsk)
        : (!!amount && parseFloat(amount) > 0 && !!bestBid)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await submitWithToast(async () => {
        if (type === "limit") {
          const total = (parseFloat(amount) * parseFloat(price)).toString();
          // conclude_address is required — fetch a fresh receive address
          const addrRes = await rpc<{ address: string }>("address_new", { account: 0 });
          const res = await rpc<{ tx_id: string }>("order_create", {
            account: 0,
            give: side === "buy"
              ? { type: "Coin", content: { amount: { decimal: total } } }
              : { type: "Token", content: { id: effectiveTokenId, amount: { decimal: amount } } },
            ask: side === "buy"
              ? { type: "Token", content: { id: effectiveTokenId, amount: { decimal: amount } } }
              : { type: "Coin", content: { amount: { decimal: total } } },
            conclude_address: addrRes.address,
            options: {},
          });
          return res.tx_id;
        } else {
          // Market: fill the best available order on the opposite side
          const targetOrder = side === "buy" ? bestAsk : bestBid;
          if (!targetOrder) throw new Error("No orders available to fill");
          // buy market → fill ask → provide ML (what the ask order asks for)
          // sell market → fill bid → provide Token (what the bid order asks for)
          const fillAmt = side === "buy" ? mlAmount : amount;
          const res = await rpc<{ tx_id: string }>("order_fill", {
            account: 0,
            order_id: targetOrder.order_id,
            fill_amount_in_ask_currency: { decimal: fillAmt },
            output_address: null,
            options: {},
          });
          return res.tx_id;
        }
      }, watchTx);

      setAmount(""); setPrice(""); setMlAmount("");
      if (type === "limit") onCreated(); else onPairRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mint-600 disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Side tabs */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700 w-fit">
        <button type="button" onClick={() => setSide("buy")}
          className={`px-6 py-2 text-sm font-semibold transition-colors ${
            side === "buy" ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"
          }`}>Buy</button>
        <button type="button" onClick={() => setSide("sell")}
          className={`px-6 py-2 text-sm font-semibold transition-colors ${
            side === "sell" ? "bg-red-700 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"
          }`}>Sell</button>
      </div>

      {/* Order type underline tabs */}
      <div className="flex gap-4 border-b border-gray-800 pb-0">
        {(["limit", "market"] as const).map(t => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`pb-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              type === t ? "border-mint-500 text-mint-400" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}>{t}</button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-red-300 text-sm">{error}</div>
      )}

      {/* ── Balance display ── */}
      {(mlBalance !== null || tokenBalance !== null) && (
        <div className="flex gap-4 rounded-lg bg-gray-800/60 border border-gray-700/50 px-3 py-2 text-xs">
          <span className="text-gray-500">
            ML: <span className={`font-mono ${side === "buy" ? "text-gray-200" : "text-gray-400"}`}>
              {mlBalance ?? "…"}
            </span>
          </span>
          {selectedTokenId && (
            <span className="text-gray-500">
              {ticker}: <span className={`font-mono ${side === "sell" ? "text-gray-200" : "text-gray-400"}`}>
                {tokenBalance ?? "…"}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Manual token ID input when no pair is selected */}
      {!selectedTokenId && (
        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Token ID</label>
          <input type="text" placeholder="mmltk1…"
            value={tokenId} onChange={e => setTokenId(e.target.value)}
            className={inputCls} />
        </div>
      )}

      {/* ── Limit order inputs ── */}
      {type === "limit" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs text-gray-400">{effectiveTicker} amount</label>
              <input type="number" min="0" step="any" placeholder="0.0"
                value={amount} onChange={e => setAmount(e.target.value)} disabled={loading}
                className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs text-gray-400">Price (ML/{effectiveTicker})</label>
              <input type="number" min="0" step="any" placeholder="0.0"
                value={price} onChange={e => setPrice(e.target.value)} disabled={loading}
                className={inputCls} />
            </div>
          </div>
          {totalML && (
            <p className="text-xs text-gray-500">
              Total ML: <span className="font-mono text-gray-300">{totalML}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Market buy inputs ── */}
      {type === "market" && side === "buy" && (
        <div className="space-y-3">
          {bestAskPrice
            ? <p className="text-xs text-gray-500">Best ask: <span className="font-mono text-green-400">{bestAskPrice} ML/{effectiveTicker}</span></p>
            : selectedTokenId && <p className="text-xs text-amber-400">No asks available — load the order book first.</p>
          }
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-400">ML to spend</label>
            <input type="number" min="0" step="any" placeholder="0.0"
              value={mlAmount} onChange={e => setMlAmount(e.target.value)} disabled={loading}
              className={inputCls} />
          </div>
          {estTokens && (
            <p className="text-xs text-gray-500">
              Est. receive: <span className="font-mono text-gray-300">{estTokens} {effectiveTicker}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Market sell inputs ── */}
      {type === "market" && side === "sell" && (
        <div className="space-y-3">
          {bestBidPrice
            ? <p className="text-xs text-gray-500">Best bid: <span className="font-mono text-red-400">{bestBidPrice} ML/{effectiveTicker}</span></p>
            : selectedTokenId && <p className="text-xs text-amber-400">No bids available — load the order book first.</p>
          }
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-400">{effectiveTicker} to sell</label>
            <input type="number" min="0" step="any" placeholder="0.0"
              value={amount} onChange={e => setAmount(e.target.value)} disabled={loading}
              className={inputCls} />
          </div>
          {estML && (
            <p className="text-xs text-gray-500">
              Est. receive: <span className="font-mono text-gray-300">{estML} ML</span>
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={!canSubmit}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
          side === "buy" ? "bg-green-700 hover:bg-green-600" : "bg-red-700 hover:bg-red-600"
        }`}>
        {loading && (
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {loading ? "Submitting…" : `${side === "buy" ? "Buy" : "Sell"} ${type === "limit" ? "Limit" : "Market"}`}
      </button>
    </form>
  );
}

// ── Fill order form ───────────────────────────────────────────────────────────

// ── My orders ─────────────────────────────────────────────────────────────────

function MyOrderRow({ order, onAction }: { order: OrderInfo; onAction: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const run = async (method: string, extraParams: Record<string, unknown> = {}) => {
    setLoading(true);
    setError(null);
    try {
      await submitWithToast(
        async () => {
          const res = await rpc<{ tx_id: string }>(method, {
            account: 0,
            order_id: order.order_id,
            options: {},
            ...extraParams,
          });
          return res.tx_id;
        },
        watchTx,
      );
      onAction();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const data = order.existing_order_data;
  const isConcluded = order.is_marked_as_concluded_in_wallet || !data;
  const isFrozen    = data?.is_frozen || order.is_marked_as_frozen_in_wallet;

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">Order ID</p>
          <span className="inline-flex items-center gap-1 flex-wrap">
            <span className="font-mono text-xs text-mint-400 break-all">{order.order_id}</span>
            <CopyButton value={order.order_id} title="Copy order ID" />
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          {!isConcluded && !isFrozen && (
            <button onClick={() => run("order_freeze")} disabled={loading}
              className="rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 px-3 py-1.5 text-xs
                         font-medium text-gray-300 transition-colors disabled:opacity-40">
              Freeze
            </button>
          )}
          {!isConcluded && (
            <button onClick={() => run("order_conclude")} disabled={loading}
              className="rounded-lg bg-red-900/40 hover:bg-red-800/60 border border-red-800 px-3 py-1.5 text-xs
                         font-medium text-red-300 transition-colors disabled:opacity-40">
              {loading ? "…" : "Conclude"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Give</p>
          <p className="font-mono text-gray-200">
            {currencyAmount(order.initially_given)}
            <span className="text-gray-500 text-xs ml-1">{currencyLabel(order.initially_given)}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Ask</p>
          <p className="font-mono text-gray-200">
            {currencyAmount(order.initially_asked)}
            <span className="text-gray-500 text-xs ml-1">{currencyLabel(order.initially_asked)}</span>
          </p>
        </div>
        {data && (
          <>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Remaining give</p>
              <p className="font-mono text-gray-200">
                {data.give_balance.decimal}
                <span className="text-gray-500 text-xs ml-1">{currencyLabel(order.initially_given)}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Remaining ask</p>
              <p className="font-mono text-gray-200">
                {data.ask_balance.decimal}
                <span className="text-gray-500 text-xs ml-1">{currencyLabel(order.initially_asked)}</span>
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isConcluded && <span className="text-xs text-gray-600">Concluded</span>}
        {isFrozen && <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-800 rounded px-1.5 py-0.5">frozen</span>}
        {data && !isConcluded && (
          <span className="text-xs text-gray-600">Created {formatTimestamp(data.creation_timestamp.timestamp)}</span>
        )}
      </div>

      {error && <p className="text-xs text-red-400 break-all">{error}</p>}
    </div>
  );
}

// ── Pair order book row ───────────────────────────────────────────────────────

/**
 * A single row in the pair order book.
 *
 * `side === "ask"`: order gives Token, asks ML  → user provides ML to fill
 * `side === "bid"`: order gives ML, asks Token  → user provides Token to fill
 */
function PairBookRow({
  order,
  side,
  ticker,
  onFilled,
}: {
  order: OrderInfo;
  side: "ask" | "bid";
  ticker: string;
  onFilled: () => void;
}) {
  const [fillAmount, setFillAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = order.existing_order_data;
  if (!data || data.is_frozen || order.is_marked_as_concluded_in_wallet) return null;

  // For asks (give Token → ask ML): token qty = give_balance, ML qty = ask_balance
  // For bids (give ML → ask Token): ML qty = give_balance, token qty = ask_balance
  const tokenQty  = side === "ask" ? data.give_balance.decimal : data.ask_balance.decimal;
  const mlQty     = side === "ask" ? data.ask_balance.decimal  : data.give_balance.decimal;
  const price     = calcPrice(mlQty, tokenQty);
  const fillLabel = side === "ask" ? "ML" : ticker;

  const handleFill = async () => {
    setLoading(true);
    setError(null);
    try {
      await submitWithToast(
        async () => {
          const res = await rpc<{ tx_id: string }>("order_fill", {
            account: 0,
            order_id: order.order_id,
            fill_amount_in_ask_currency: { decimal: fillAmount },
            output_address: null,
            options: {},
          });
          return res.tx_id;
        },
        watchTx,
      );
      setFillAmount("");
      onFilled();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <tr className="hover:bg-gray-800/40 transition-colors">
      <td className="px-3 py-2.5 font-mono text-sm text-gray-200">{price}</td>
      <td className="px-3 py-2.5 font-mono text-sm text-gray-300">{tokenQty}</td>
      <td className="px-3 py-2.5 font-mono text-sm text-gray-400">{mlQty}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <input
            type="number" min="0" step="any" placeholder={fillLabel}
            value={fillAmount} onChange={e => setFillAmount(e.target.value)}
            disabled={loading}
            className="w-24 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600
                       px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-mint-600 disabled:opacity-50"
          />
          <button
            onClick={handleFill} disabled={loading || !fillAmount}
            className="rounded-lg bg-mint-700 hover:bg-mint-600 px-2.5 py-1 text-xs font-medium text-white
                       transition-colors disabled:opacity-40"
          >
            {loading ? "…" : "Fill"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-0.5 break-all">{error}</p>}
      </td>
    </tr>
  );
}

// ── Pair order book panel ─────────────────────────────────────────────────────

function PairBookPanel({
  title,
  orders,
  side,
  ticker,
  colorClass,
  onFilled,
}: {
  title: string;
  orders: OrderInfo[];
  side: "ask" | "bid";
  ticker: string;
  colorClass: string;
  onFilled: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-800 overflow-x-auto">
      <div className={`px-4 py-2 border-b border-gray-800 text-xs font-semibold uppercase tracking-wider ${colorClass}`}>
        {title}
      </div>
      {orders.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">No orders.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="px-3 py-2">Price (ML/{ticker})</th>
              <th className="px-3 py-2">{ticker} amount</th>
              <th className="px-3 py-2">ML total</th>
              <th className="px-3 py-2">Fill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {orders.map(o => (
              <PairBookRow key={o.order_id} order={o} side={side} ticker={ticker} onFilled={onFilled} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialOwnOrders: OrderInfo[];
  balanceTokens?: { tokenId: string; ticker: string }[];
}

export default function OrderBook({ initialOwnOrders, balanceTokens = [] }: Props) {
  const [ownOrders, setOwnOrders] = useState<OrderInfo[]>(initialOwnOrders);

  // ── Pair selector state ──
  const [favourites, setFavourites] = useState<FavouriteEntry[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [pairAsks, setPairAsks] = useState<OrderInfo[]>([]); // give Token, ask ML
  const [pairBids, setPairBids] = useState<OrderInfo[]>([]); // give ML, ask Token
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [mlBalance, setMlBalance] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);

  useEffect(() => {
    // Auto-star any tokens that have a balance — merge into favourites
    let favs = loadFavourites();
    if (balanceTokens.length > 0) {
      const existingIds = new Set(favs.map(f => f.tokenId));
      const newEntries = balanceTokens.filter(t => !existingIds.has(t.tokenId));
      if (newEntries.length > 0) {
        favs = [...newEntries, ...favs];
        localStorage.setItem(FAV_KEY, JSON.stringify(favs));
      }
    }
    setFavourites(favs);

    // Priority: 1) token with balance, 2) first starred, 3) nothing (show message)
    const autoSelect = balanceTokens[0]?.tokenId ?? favs[0]?.tokenId ?? null;
    if (autoSelect) handlePairChange(autoSelect);
  }, []);

  const rawTicker = favourites.find(f => f.tokenId === selectedTokenId)?.ticker ?? "???";
  const selectedTicker = rawTicker === "???" ? (selectedTokenId?.slice(0, 12) + "…") : rawTicker;

  const loadPairOrders = async (tokenId: string) => {
    setPairLoading(true);
    setPairError(null);
    try {
      const tokenCurrency = { type: "Token", content: tokenId };
      const [asksRaw, bidsRaw, balance] = await Promise.all([
        // Asks: give Token, ask ML — sorted by price ascending (cheapest ask first)
        rpc<ActiveOrderRaw[]>("order_list_all_active", {
          account: 0,
          ask_currency: { type: "Coin" },
          give_currency: tokenCurrency,
        }),
        // Bids: give ML, ask Token — sorted by price descending (highest bid first)
        rpc<ActiveOrderRaw[]>("order_list_all_active", {
          account: 0,
          ask_currency: tokenCurrency,
          give_currency: { type: "Coin" },
        }),
        rpc<{ coins: { decimal: string }; tokens: Record<string, { decimal: string }> }>(
          "account_balance", { account: 0, utxo_states: ["Confirmed"], with_locked: "Unlocked" }
        ),
      ]);

      setMlBalance(balance.coins.decimal);
      setTokenBalance(balance.tokens[tokenId]?.decimal ?? "0");

      const asks = asksRaw.map(normalizeActiveOrder);
      const bids = bidsRaw.map(normalizeActiveOrder);

      // Sort asks ascending by price (ML/token), bids descending
      const priceOf = (o: OrderInfo, side: "ask" | "bid") => {
        const d = o.existing_order_data;
        if (!d) return 0;
        const tok = parseFloat(side === "ask" ? d.give_balance.decimal : d.ask_balance.decimal);
        const ml  = parseFloat(side === "ask" ? d.ask_balance.decimal  : d.give_balance.decimal);
        return tok ? ml / tok : 0;
      };

      setPairAsks(asks.sort((a, b) => priceOf(a, "ask") - priceOf(b, "ask")));
      setPairBids(bids.sort((a, b) => priceOf(b, "bid") - priceOf(a, "bid")));
    } catch (err) {
      setPairError((err as Error).message);
    } finally {
      setPairLoading(false);
    }
  };

  const handlePairChange = (tokenId: string) => {
    const id = tokenId || null;
    setSelectedTokenId(id);
    setPairAsks([]);
    setPairBids([]);
    if (id) loadPairOrders(id);
  };

  const refreshOwn = async () => {
    try {
      const orders = await rpc<OrderInfo[]>("order_list_own", { account: 0 });
      setOwnOrders(orders);
    } catch { /* ignore */ }
  };

  const activeOwn = ownOrders.filter(o =>
    !o.is_marked_as_concluded_in_wallet && o.existing_order_data && !o.existing_order_data.is_frozen
  );
  const inactiveOwn = ownOrders.filter(o =>
    o.is_marked_as_concluded_in_wallet || !o.existing_order_data || o.existing_order_data.is_frozen
  );

  return (
    <div className="space-y-8">

      {/* ── Pair selector ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-200 mb-3">Order Book</h2>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          {favourites.length === 0 ? (
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-5 text-sm text-gray-400">
              <p className="font-medium text-gray-300 mb-1">No tokens in your watchlist</p>
              <p>
                To trade, you need at least one token added to your watchlist.{" "}
                Go to{" "}
                <a href="/token-management" className="text-mint-400 hover:text-mint-300 underline">
                  Token Management
                </a>
                , search for a token, and pin it — then come back here to trade.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-gray-400 shrink-0">Trading pair:</label>
              <select
                value={selectedTokenId ?? ""}
                onChange={e => handlePairChange(e.target.value)}
                className="rounded-lg bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-mint-600"
              >
                <option value="">— Select pair —</option>
                {favourites.map(f => (
                  <option key={f.tokenId} value={f.tokenId}>
                    ML / {f.ticker === "???" ? f.tokenId.slice(0, 12) + "…" : f.ticker}
                  </option>
                ))}
              </select>
              {selectedTokenId && (
                <button
                  onClick={() => loadPairOrders(selectedTokenId)}
                  disabled={pairLoading}
                  className="rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-2 text-xs
                             font-medium text-gray-300 transition-colors disabled:opacity-50"
                >
                  {pairLoading ? "Loading…" : "Refresh"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Order book tables ── */}
        {selectedTokenId && (
          <div className="mt-4 space-y-4">
            {pairError && (
              <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-red-300 text-sm">{pairError}</div>
            )}
            {pairLoading && (
              <p className="text-sm text-gray-500">Loading orders…</p>
            )}
            {!pairLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PairBookPanel
                  title={`Asks — sell ${selectedTicker} for ML`}
                  orders={pairAsks}
                  side="ask"
                  ticker={selectedTicker}
                  colorClass="text-red-400"
                  onFilled={() => loadPairOrders(selectedTokenId)}
                />
                <PairBookPanel
                  title={`Bids — buy ${selectedTicker} with ML`}
                  orders={pairBids}
                  side="bid"
                  ticker={selectedTicker}
                  colorClass="text-green-400"
                  onFilled={() => loadPairOrders(selectedTokenId)}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Buy / Sell ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-200 mb-3">Place Order</h2>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
          <BuySellPanel
            selectedTokenId={selectedTokenId}
            ticker={selectedTicker}
            pairAsks={pairAsks}
            pairBids={pairBids}
            mlBalance={mlBalance}
            tokenBalance={tokenBalance}
            onCreated={refreshOwn}
            onPairRefresh={() => selectedTokenId && loadPairOrders(selectedTokenId)}
          />
        </div>
      </section>

      {/* ── My orders ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-200 mb-3">
          My Orders
          {activeOwn.length > 0 && (
            <span className="ml-2 text-mint-400 font-mono text-sm">{activeOwn.length} active</span>
          )}
        </h2>
        {ownOrders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders yet.</p>
        ) : (
          <div className="space-y-3">
            {activeOwn.map(o => (
              <MyOrderRow key={o.order_id} order={o} onAction={refreshOwn} />
            ))}
            {inactiveOwn.length > 0 && activeOwn.length > 0 && (
              <p className="text-xs text-gray-600 pt-1">+ {inactiveOwn.length} concluded/frozen</p>
            )}
            {inactiveOwn.length > 0 && activeOwn.length === 0 && (
              <div className="space-y-3">
                {inactiveOwn.map(o => (
                  <MyOrderRow key={o.order_id} order={o} onAction={refreshOwn} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
