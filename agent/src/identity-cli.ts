// A small CLI: prints the DAO-WARDEN agent's on-chain-verified ERC-8004 identity.
// Run: npm run identity
import { readAgentIdentity } from "./identity.js";
import { readReputation } from "./validate.js";

async function main() {
  const id = await readAgentIdentity();
  const rep = await readReputation();
  console.log("\n🛡️  DAO-WARDEN — ERC-8004 identity\n");
  console.log(`  global agentId   : ${id.globalId}`);
  console.log(`  owner/wallet     : ${id.owner}`);
  console.log(`  AgentCard (IPFS) : ${id.agentURI}`);
  console.log(`  framework        : ${id.framework}`);
  console.log(`  guards Governor  : ${id.guards}`);
  console.log(`  validator        : ${id.validator}`);
  console.log(`  reputation       : ${rep.count} review(s), average ${rep.average}/100\n`);
}

main().catch((e) => { console.error("Error:", e); process.exit(1); });
