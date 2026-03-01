# LinkStakingBot

A lightweight Node.js bot that monitors the **Chainlink Staking v0.2 Community Pool** in real time and alerts when staking capacity opens up.

## Features

- Monitors pool capacity, active/open/paused status on every new block
- Supports both **WebSocket** (low-latency) and **HTTP RPC** providers
- Exponential backoff on errors to avoid rate-limiting
- Periodic config refresh to track pool size and staker limits
- Minimal dependencies — only `ethers.js`

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- An Ethereum RPC endpoint (optional — defaults to a public node)

## Setup

```bash
git clone https://github.com/myconova/LinkStakingBot.git
cd LinkStakingBot
npm install
```

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

## Usage

```bash
node index.js
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WS_URL` | No | WebSocket RPC URL for real-time block subscriptions |
| `RPC_URL` | No | HTTP RPC URL (defaults to `https://ethereum.publicnode.com`) |

> **Tip:** Using a WebSocket provider (`WS_URL`) gives lower-latency block notifications compared to the HTTP polling fallback.

## How It Works

The bot connects to the Chainlink Staking v0.2 contract (`0xBc10f2E862ED4502144c7d632a3459F49DFCDB5e`) and on each new block:

1. Refreshes pool configuration (max pool size, staker limits) every ~20 blocks
2. Queries live state: total staked principal, active, open, and paused flags
3. Logs pool status and alerts when capacity becomes available

## Tech Stack

- **Node.js** — runtime
- **ethers.js v6** — Ethereum interaction
