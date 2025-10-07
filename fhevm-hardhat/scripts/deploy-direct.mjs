import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const RPC_URL = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL;
  if (!PRIVATE_KEY || !RPC_URL) {
    throw new Error('Missing env: PRIVATE_KEY and RPC_URL');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log('[direct-deploy] deployer=', wallet.address);

  // Load artifact
  const artifactPath = path.resolve(__dirname, '../artifacts/contracts/ScriptVaultRegistry.sol/ScriptVaultRegistry.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  const { abi, bytecode } = artifact;

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  console.log('[direct-deploy] tx hash=', contract.deploymentTransaction().hash);
  const addr = await contract.getAddress();
  console.log('[direct-deploy] address=', addr);

  // Update frontend addresses
  const outDir = path.resolve(__dirname, '../../fhevm-frontend/public/abi');
  mkdirSync(outDir, { recursive: true });
  const addrFile = path.join(outDir, 'ScriptVaultRegistryAddresses.json');
  let json = {};
  if (existsSync(addrFile)) {
    try { json = JSON.parse(readFileSync(addrFile, 'utf-8')); } catch {}
  }
  json['sepolia'] = addr;
  writeFileSync(addrFile, JSON.stringify(json, null, 2));

  // Save ABI (for safety)
  const abiFile = path.join(outDir, 'ScriptVaultRegistryABI.json');
  writeFileSync(abiFile, JSON.stringify(abi, null, 2));

  console.log('[direct-deploy] frontend updated:', addrFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

