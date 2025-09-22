// deploy/deploy.ts
import fs from "fs";
import path from "path";
import readline from "readline";
import { ethers as hardhatEthers } from "hardhat";
import { Wallet, JsonRpcProvider } from "ethers";

async function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) =>
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  const privateKey = await ask("Enter the deployer private key (testnet only): ");
  let rpc = await ask("Enter the RPC URL (press Enter to use public Sepolia: https://sepolia.drpc.org): ");
  if (!rpc) rpc = "https://sepolia.drpc.org";

  const provider = new JsonRpcProvider(rpc);
  const wallet = new Wallet(privateKey, provider);

  console.log("Deployer account:", wallet.address);

  // ----------------- Deploy RiskControl -----------------
  const RiskControlFactory = await hardhatEthers.getContractFactory("RiskControl", wallet);
  const RiskControl = await RiskControlFactory.deploy();
  await RiskControl.waitForDeployment();

  const deployedAddress = (RiskControl as any).target || (RiskControl as any).address;
  console.log("RiskControl contract deployed at:", deployedAddress);

  // ----------------- Write frontend config -----------------
  const frontendSrcDir = path.join(__dirname, "..", "frontend", "web", "src");
  if (!fs.existsSync(frontendSrcDir)) {
    console.warn("Frontend src directory not found, skipping config.json write:", frontendSrcDir);
  } else {
    // Write config.json
    const config = {
      network: rpc,
      contractAddress: deployedAddress,
      deployer: wallet.address,
    };
    fs.writeFileSync(path.join(frontendSrcDir, "config.json"), JSON.stringify(config, null, 2));
    console.log("Wrote frontend config: frontend/web/src/config.json");

    // ----------------- Extract and save pure ABI -----------------
    try {
      const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "RiskControl.sol", "RiskControl.json");
      if (!fs.existsSync(artifactPath)) {
        throw new Error("ABI file not found. Did you compile the contract?");
      }

      // Read the full artifact
      const artifactContent = fs.readFileSync(artifactPath, "utf-8");
      const artifact = JSON.parse(artifactContent);
      
      // Extract the ABI array
      const abi = artifact.abi;
      if (!abi || !Array.isArray(abi)) {
        throw new Error("ABI not found in artifact");
      }

      const abiDir = path.join(frontendSrcDir, "abi");
      if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

      const targetAbiPath = path.join(abiDir, "RiskControlABI.json");
      
      // Write only the ABI array to the file
      fs.writeFileSync(targetAbiPath, JSON.stringify(abi, null, 2));
      console.log("Extracted and saved pure ABI to frontend/web/src/abi/RiskControlABI.json");
    } catch (e) {
      console.error("Failed to extract and save ABI:", e);
      console.warn(
        "Please manually extract the ABI from artifacts/.../RiskControl.json and save it to frontend/web/src/abi/RiskControlABI.json"
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});