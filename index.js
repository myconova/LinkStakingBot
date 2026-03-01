const { ethers } = require("ethers");

// Provider selection: prefer WS for low-latency; HTTP fallback
const WS = process.env.WS_URL;
const RPC = process.env.RPC_URL || "https://ethereum.publicnode.com";
const provider = WS ? new ethers.WebSocketProvider(WS) : new ethers.JsonRpcProvider(RPC);

// Chainlink Staking v0.2 Community Pool
const ADDR = ethers.getAddress("0xBc10f2E862ED4502144c7d632a3459F49DFCDB5e");

// ABI — confirmed working functions on v0.2
const ABI = [
  "function getMaxPoolSize() view returns (uint256)",
  "function getTotalPrincipal() view returns (uint256)",
  "function isActive() view returns (bool)",
  "function isOpen() view returns (bool)",
  "function paused() view returns (bool)",
  "function getStakerLimits() view returns (uint256 minStakeAmount, uint256 maxStakeAmount)"
];
const staking = new ethers.Contract(ADDR, ABI, provider);

const configRefreshInterval = 20;
const minBackoffMs = 1_000;
const maxBackoffMs = 60_000;
const backoffMultiplier = 2;

let cachedConfig = null;
let lastConfigBlock = 0;
let prevFull = null;
let checking = false;
let consecutiveErrors = 0;
let nextAllowedCheck = 0;

function log(...args) { console.log(new Date().toISOString(), ...args); }
function warn(...args) { console.warn(new Date().toISOString(), ...args); }

async function checkAtBlock(blockNumber) {
  if (Date.now() < nextAllowedCheck) return;
  if (checking) return;
  checking = true;

  try {
    // Refresh config periodically (rarely changes)
    if (!cachedConfig || (blockNumber - lastConfigBlock) >= configRefreshInterval) {
      const [maxPoolSize, limits] = await Promise.all([
        staking.getMaxPoolSize(),
        staking.getStakerLimits()
      ]);
      cachedConfig = { maxPoolSize, minStake: limits[0], maxStake: limits[1] };
      lastConfigBlock = blockNumber;
    }

    // Fetch live pool state
    const [totalPrincipal, active, open, paused] = await Promise.all([
      staking.getTotalPrincipal(),
      staking.isActive(),
      staking.isOpen(),
      staking.paused()
    ]);

    const hasCapacity = totalPrincipal < cachedConfig.maxPoolSize;
    const poolOpen = active && open && !paused && hasCapacity;
    const wasClosed = prevFull === true;

    // Notify on pool opening
    if ((prevFull === null && poolOpen) || (wasClosed && poolOpen)) {
      const remaining = cachedConfig.maxPoolSize - totalPrincipal;
      log("🟢 POOL OPEN — remaining:", ethers.formatEther(remaining), "LINK");
      log("   stake limits:", ethers.formatEther(cachedConfig.minStake), "-", ethers.formatEther(cachedConfig.maxStake), "LINK");
    }

    // Status log
    log("maxPool:", ethers.formatEther(cachedConfig.maxPoolSize),
        "| staked:", ethers.formatEther(totalPrincipal),
        "| active:", active, "| open:", open, "| paused:", paused);

    prevFull = !poolOpen;
    consecutiveErrors = 0;
    nextAllowedCheck = 0;
  } catch (err) {
    consecutiveErrors++;
    const backoff = Math.min(maxBackoffMs, minBackoffMs * (backoffMultiplier ** (consecutiveErrors - 1)));
    nextAllowedCheck = Date.now() + backoff;
    warn("error:", (err && err.message) || err, "- backoff", backoff, "ms");
  } finally {
    checking = false;
  }
}

(async function start() {
  try {
    const code = await provider.getCode(ADDR);
    if (code === "0x") { console.error("No contract at address"); return; }

    log("Watcher started — Chainlink Staking v0.2");
    const bn = await provider.getBlockNumber();
    await checkAtBlock(bn);

    if (provider instanceof ethers.WebSocketProvider) {
      provider.on("block", (bn) => checkAtBlock(bn).catch(() => {}));
    } else {
      setInterval(async () => {
        if (Date.now() < nextAllowedCheck) return;
        try { await checkAtBlock(await provider.getBlockNumber()); } catch {}
      }, 15_000);
    }

    process.on("uncaughtException", (e) => warn("uncaught:", e && e.message));
    process.on("unhandledRejection", (r) => warn("unhandled:", r));
  } catch (e) {
    console.error("Fatal:", e && e.message);
    process.exit(1);
  }
})();