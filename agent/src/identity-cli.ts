// Maly CLI: wypisuje zweryfikowana on-chain tozsamosc ERC-8004 agenta DAO-WARDEN.
// Uruchomienie: npm run identity
import { readAgentIdentity } from "./identity.js";
import { readReputation } from "./validate.js";

async function main() {
  const id = await readAgentIdentity();
  const rep = await readReputation();
  console.log("\n🛡️  DAO-WARDEN — tozsamosc ERC-8004\n");
  console.log(`  agentId globalny : ${id.globalId}`);
  console.log(`  wlasciciel/portfel: ${id.owner}`);
  console.log(`  AgentCard (IPFS) : ${id.agentURI}`);
  console.log(`  framework        : ${id.framework}`);
  console.log(`  chroni Governor  : ${id.guards}`);
  console.log(`  walidator        : ${id.validator}`);
  console.log(`  reputacja        : ${rep.count} ocen, srednia ${rep.average}/100\n`);
}

main().catch((e) => { console.error("Blad:", e); process.exit(1); });
