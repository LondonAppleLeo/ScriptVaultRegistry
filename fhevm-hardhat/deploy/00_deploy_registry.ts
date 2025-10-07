import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import * as fs from "fs";
import * as path from "path";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(`[deploy] network=${network.name} deployer=${deployer}`);

  const deployment = await deploy("ScriptVaultRegistry", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: hre.network.name === "sepolia" ? 2 : 0,
  });

  // Export ABI & address to frontend for convenience
  const artifact = await hre.deployments.getArtifact("ScriptVaultRegistry");
  const outDir = path.resolve(__dirname, "../../fhevm-frontend/public/abi");
  fs.mkdirSync(outDir, { recursive: true });

  const abiPath = path.join(outDir, "ScriptVaultRegistryABI.json");
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));

  const addrPath = path.join(outDir, "ScriptVaultRegistryAddresses.json");
  let addresses: Record<string, string> = {};
  if (fs.existsSync(addrPath)) {
    try {
      addresses = JSON.parse(fs.readFileSync(addrPath, "utf-8"));
    } catch {}
  }
  addresses[hre.network.name] = deployment.address;
  fs.writeFileSync(addrPath, JSON.stringify(addresses, null, 2));
};

export default func;
func.tags = ["ScriptVaultRegistry"];

