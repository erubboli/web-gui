# Mintlayer Web GUI

A Docker Compose stack that runs a full Mintlayer node, a headless wallet, and an Astro-based web interface for wallet management.

## Architecture

```
Browser → Astro web GUI (port 4321)
              │  server-side proxy — credentials never reach the browser
              ▼
        wallet-rpc-daemon  :3034 (internal)
              │  JSON-RPC 2.0
              ▼
         node-daemon  :3030 (internal)
              │  P2P
              ▼
        Mintlayer network

Optional (--profile indexer):
  node-daemon → api-blockchain-scanner-daemon → postgres → api-web-server :3000
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (v2) or `docker-compose` (v1)

---

## Running

### Recommended — interactive setup

```bash
./init.sh
```

The script walks you through every option (network, wallet, passwords, ports, indexer), writes `.env`, and starts the stack. That's all you need for a first run.

---

### Manual setup

**1. Copy and edit the environment file**

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | What to change |
|---|---|
| `NETWORK` | `mainnet` or `testnet` |
| `NODE_RPC_PASSWORD` | anything strong |
| `WALLET_RPC_PASSWORD` | anything strong |

**2. Create the data directory**

```bash
mkdir -p mintlayer-data
```

Node chain data and wallet files are stored here. Inside containers it maps to `/home/mintlayer/`.

**3. Start the stack**

```bash
docker compose up -d
```

Services started:

| Container | What it does |
|---|---|
| `node-daemon` | Syncs the Mintlayer blockchain (takes hours on first run) |
| `wallet-rpc-daemon` | Headless wallet — starts with no wallet loaded |
| `web-gui` | Web interface at <http://localhost:4321> |

**4. Create your wallet**

Open <http://localhost:4321/setup> and use the **Create new wallet** form.

- Use `/home/mintlayer/my_wallet` as the path — it appears as `./mintlayer-data/my_wallet` on the host
- Write down the mnemonic shown — it will not be displayed again

**5. Make the wallet load automatically on restart**

```bash
# .env
WALLET_FILE=my_wallet
```

```bash
docker compose restart wallet-rpc-daemon
```

The dashboard at <http://localhost:4321> will now show your balance and sync status.

> **Sync time:** balance and transaction history only appear once the node has fully synced. On first run this takes several hours for mainnet. The dashboard shows the current block height so you can track progress.

---

## Optional: indexer stack

The indexer adds a PostgreSQL database, a blockchain scanner, and a REST API for querying blocks, transactions, and addresses.

```bash
docker compose --profile indexer up -d
```

The REST API is available at <http://localhost:3000> (configurable via `API_WEB_SERVER_PORT` in `.env`).

---

## Useful commands

```bash
# Start everything
docker compose up -d

# Stop everything
docker compose down

# Watch logs
docker compose logs -f
docker compose logs -f wallet-rpc-daemon

# Interactive wallet CLI (connects to the running daemon)
docker compose run --rm wallet-cli

# Restart after changing .env
docker compose restart

# Pull latest images
docker compose pull && docker compose up -d
```

---

## Web GUI pages

| Page | URL | Description |
|---|---|---|
| Dashboard | `/` | Balance, sync status, staking state |
| Addresses | `/addresses` | List and generate receive addresses |
| Send | `/send` | Send ML to an address |
| Staking | `/staking` | Staking status and instructions |
| Wallet setup | `/setup` | Create or open a wallet |

---

## Development

Run the Astro app locally against a running daemon:

```bash
cd app
npm install

export WALLET_RPC_URL=http://localhost:3034
export WALLET_RPC_USERNAME=wallet_user
export WALLET_RPC_PASSWORD=your_password

npm run dev
# → http://localhost:4321
```

To expose the wallet RPC port to the host, uncomment the `ports` block for `wallet-rpc-daemon` in `docker-compose.yml`.

---

## Security

- Run `./init.sh` or set strong passwords in `.env` before exposing this to any network.
- Wallet RPC credentials are never sent to the browser — all calls are proxied server-side by the Astro app.
- Only a fixed allowlist of RPC methods is callable through the `/api/rpc` endpoint.
- The wallet RPC (3034) and node RPC (3030) ports are not exposed to the host by default.
