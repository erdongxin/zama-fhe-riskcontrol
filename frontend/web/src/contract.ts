// contract.ts
import { ethers } from "ethers";
import abiJson from "./abi/RiskControl.json";
import configJson from "./config.json";

export const ABI = (abiJson as any).abi || abiJson;
export const config = configJson;

export async function getProvider() {
  console.log("Getting provider...");
  // if user has MetaMask, we'll use it when connecting
  if ((window as any).ethereum) {
    console.log("Using injected ethereum provider");
    const p = new ethers.BrowserProvider((window as any).ethereum);
    return p;
  }
  // fallback to public rpc
  console.log("Using fallback RPC:", config.network);
  return new ethers.JsonRpcProvider(config.network);
}

// get a read-only contract (provider based)
export async function getContractReadOnly() {
  console.log("Getting read-only contract...");
  try {
    const provider = await getProvider();
    console.log("Provider obtained");
    
    const contract = new ethers.Contract(config.contractAddress, ABI, provider);
    console.log("Read-only contract created at:", contract.target);
    return contract;
  } catch (error) {
    console.error("Error creating read-only contract:", error);
    throw error;
  }
}

// get a contract connected to signer (for write)
export async function getContractWithSigner() {
  console.log("Getting contract with signer...");
  if (!(window as any).ethereum) {
    console.error("No injected wallet");
    throw new Error("No injected wallet");
  }
  try {
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    console.log("Provider for signer created");
    
    const signer = await provider.getSigner();
    console.log("Signer obtained, address:", await signer.getAddress());
    
    const contract = new ethers.Contract(config.contractAddress, ABI, signer);
    console.log("Contract with signer created at:", contract.target);
    return contract;
  } catch (error) {
    console.error("Error creating contract with signer:", error);
    throw error;
  }
}

// helper: format address lowercase
export function normAddr(a: string) { 
  return a ? a.toLowerCase() : a; 
}