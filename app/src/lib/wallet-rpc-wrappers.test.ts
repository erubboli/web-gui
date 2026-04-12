/**
 * Additional coverage for wallet-rpc.ts wrapper functions.
 * Covers staking, delegation, tokens, orders, wallet settings, transactions, UTXOs.
 * Same fetch-mock pattern as wallet-rpc.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn<typeof fetch>();

function mockOk(result: unknown): Response {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  vi.resetModules();
  process.env.WALLET_RPC_URL = 'http://localhost:3034';
  process.env.WALLET_RPC_USERNAME = '';
  process.env.WALLET_RPC_PASSWORD = '';
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockImplementation(() => Promise.resolve(mockOk(null)));
});

afterEach(() => {
  mockFetch.mockReset();
  vi.unstubAllGlobals();
});

function getLastBody() {
  const [, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return JSON.parse(init!.body as string) as { method: string; params: Record<string, unknown> };
}

// ── Sync / node ───────────────────────────────────────────────────────────────

describe('sync / node wrappers', () => {
  it('walletBestBlock calls "wallet_best_block"', async () => {
    const { walletBestBlock } = await import('@/lib/wallet-rpc');
    await walletBestBlock();
    expect(getLastBody().method).toBe('wallet_best_block');
  });

  it('nodeChainstateInfo calls "node_chainstate_info"', async () => {
    const { nodeChainstateInfo } = await import('@/lib/wallet-rpc');
    await nodeChainstateInfo();
    expect(getLastBody().method).toBe('node_chainstate_info');
  });
});

// ── Addresses ─────────────────────────────────────────────────────────────────

describe('address wrappers', () => {
  it('newAddress calls "address_new" with account', async () => {
    const { newAddress } = await import('@/lib/wallet-rpc');
    await newAddress(1);
    const { method, params } = getLastBody();
    expect(method).toBe('address_new');
    expect(params['account']).toBe(1);
  });
});

// ── Staking ───────────────────────────────────────────────────────────────────

describe('staking wrappers', () => {
  it('getStakingStatus calls "staking_status"', async () => {
    const { getStakingStatus } = await import('@/lib/wallet-rpc');
    await getStakingStatus(0);
    expect(getLastBody().method).toBe('staking_status');
  });

  it('listPools calls "staking_list_pools"', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listPools } = await import('@/lib/wallet-rpc');
    await listPools(0);
    expect(getLastBody().method).toBe('staking_list_pools');
  });

  it('listCreatedBlocks calls "staking_list_created_block_ids"', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listCreatedBlocks } = await import('@/lib/wallet-rpc');
    await listCreatedBlocks(0);
    expect(getLastBody().method).toBe('staking_list_created_block_ids');
  });

  it('listDelegations calls "delegation_list_ids"', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listDelegations } = await import('@/lib/wallet-rpc');
    await listDelegations(0);
    expect(getLastBody().method).toBe('delegation_list_ids');
  });

  it('createPool maps all 5 params to correct RPC fields', async () => {
    const { createPool } = await import('@/lib/wallet-rpc');
    await createPool(0, '1000', '0.5', '10', 'decomAddr');
    const { method, params } = getLastBody();
    expect(method).toBe('staking_create_pool');
    expect(params['amount']).toEqual({ decimal: '1000' });
    expect(params['cost_per_block']).toEqual({ decimal: '0.5' });
    expect(params['margin_ratio_per_thousand']).toBe('10');
    expect(params['decommission_address']).toBe('decomAddr');
  });

  it('decommissionPool calls "staking_decommission_pool" with pool_id', async () => {
    const { decommissionPool } = await import('@/lib/wallet-rpc');
    await decommissionPool(0, 'pool123');
    const { method, params } = getLastBody();
    expect(method).toBe('staking_decommission_pool');
    expect(params['pool_id']).toBe('pool123');
  });
});

// ── Delegations ───────────────────────────────────────────────────────────────

describe('delegation wrappers', () => {
  it('createDelegation calls "delegation_create" with pool_id and address', async () => {
    const { createDelegation } = await import('@/lib/wallet-rpc');
    await createDelegation(0, 'pool1', 'ownerAddr');
    const { method, params } = getLastBody();
    expect(method).toBe('delegation_create');
    expect(params['pool_id']).toBe('pool1');
    expect(params['address']).toBe('ownerAddr');
  });

  it('delegationStake calls "delegation_stake" with decimal amount', async () => {
    const { delegationStake } = await import('@/lib/wallet-rpc');
    await delegationStake(0, 'del1', '50');
    const { method, params } = getLastBody();
    expect(method).toBe('delegation_stake');
    expect(params['delegation_id']).toBe('del1');
    expect(params['amount']).toEqual({ decimal: '50' });
  });

  it('delegationWithdraw calls "delegation_withdraw" with address', async () => {
    const { delegationWithdraw } = await import('@/lib/wallet-rpc');
    await delegationWithdraw(0, 'del1', '10', 'destAddr');
    const { method, params } = getLastBody();
    expect(method).toBe('delegation_withdraw');
    expect(params['address']).toBe('destAddr');
    expect(params['amount']).toEqual({ decimal: '10' });
  });

  it('sweepDelegation calls "staking_sweep_delegation" with destination_address', async () => {
    const { sweepDelegation } = await import('@/lib/wallet-rpc');
    await sweepDelegation(0, 'del1', 'destAddr');
    const { method, params } = getLastBody();
    expect(method).toBe('staking_sweep_delegation');
    expect(params['destination_address']).toBe('destAddr');
    expect(params['delegation_id']).toBe('del1');
  });
});

// ── Tokens / orders ───────────────────────────────────────────────────────────

describe('token / order wrappers', () => {
  it('getTokensInfo calls "node_get_tokens_info" with token_ids array', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { getTokensInfo } = await import('@/lib/wallet-rpc');
    await getTokensInfo(['tok1', 'tok2']);
    const { method, params } = getLastBody();
    expect(method).toBe('node_get_tokens_info');
    expect(params['token_ids']).toEqual(['tok1', 'tok2']);
  });

  it('listOwnOrders calls "order_list_own"', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listOwnOrders } = await import('@/lib/wallet-rpc');
    await listOwnOrders(0);
    expect(getLastBody().method).toBe('order_list_own');
  });

  it('listAllActiveOrders calls "order_list_all_active" with null currencies by default', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listAllActiveOrders } = await import('@/lib/wallet-rpc');
    await listAllActiveOrders(0);
    const { method, params } = getLastBody();
    expect(method).toBe('order_list_all_active');
    expect(params['ask_currency']).toBeNull();
    expect(params['give_currency']).toBeNull();
  });
});

// ── Wallet settings ───────────────────────────────────────────────────────────

describe('wallet settings wrappers', () => {
  it('walletShowSeedPhrase calls "wallet_show_seed_phrase"', async () => {
    const { walletShowSeedPhrase } = await import('@/lib/wallet-rpc');
    await walletShowSeedPhrase();
    expect(getLastBody().method).toBe('wallet_show_seed_phrase');
  });

  it('walletLockPrivateKeys calls "wallet_lock_private_keys"', async () => {
    const { walletLockPrivateKeys } = await import('@/lib/wallet-rpc');
    await walletLockPrivateKeys();
    expect(getLastBody().method).toBe('wallet_lock_private_keys');
  });

  it('walletUnlockPrivateKeys calls "wallet_unlock_private_keys" with password', async () => {
    const { walletUnlockPrivateKeys } = await import('@/lib/wallet-rpc');
    await walletUnlockPrivateKeys('mypass');
    const { method, params } = getLastBody();
    expect(method).toBe('wallet_unlock_private_keys');
    expect(params['password']).toBe('mypass');
  });

  it('walletSetLookaheadSize sends i_know_what_i_am_doing=true', async () => {
    const { walletSetLookaheadSize } = await import('@/lib/wallet-rpc');
    await walletSetLookaheadSize(100);
    const { method, params } = getLastBody();
    expect(method).toBe('wallet_set_lookahead_size');
    expect(params['lookahead_size']).toBe(100);
    expect(params['i_know_what_i_am_doing']).toBe(true);
  });
});

// ── Transactions ──────────────────────────────────────────────────────────────

describe('transaction wrappers', () => {
  it('listTransactions calls "transaction_list_by_address" with default limit 50', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listTransactions } = await import('@/lib/wallet-rpc');
    await listTransactions(0);
    const { method, params } = getLastBody();
    expect(method).toBe('transaction_list_by_address');
    expect(params['limit']).toBe(50);
    expect(params['address']).toBeNull();
  });

  it('listPendingTransactions calls "transaction_list_pending"', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listPendingTransactions } = await import('@/lib/wallet-rpc');
    await listPendingTransactions(0);
    expect(getLastBody().method).toBe('transaction_list_pending');
  });

  it('getTransactionSignedRaw calls "transaction_get_signed_raw" with transaction_id', async () => {
    const { getTransactionSignedRaw } = await import('@/lib/wallet-rpc');
    await getTransactionSignedRaw('txhex123', 0);
    const { method, params } = getLastBody();
    expect(method).toBe('transaction_get_signed_raw');
    expect(params['transaction_id']).toBe('txhex123');
  });
});

// ── UTXOs ─────────────────────────────────────────────────────────────────────

describe('UTXO wrappers', () => {
  it('listUtxos calls "account_utxos" with account', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockOk([])));
    const { listUtxos } = await import('@/lib/wallet-rpc');
    await listUtxos(0);
    const { method, params } = getLastBody();
    expect(method).toBe('account_utxos');
    expect(params['account']).toBe(0);
  });
});
