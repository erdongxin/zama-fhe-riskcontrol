// contract.ts
import { ethers } from "ethers";
import configJson from "./config.json";
import RiskControlABI from "./abi/RiskControlABI.json";

export const ABI = RiskControlABI;
export const config = configJson;

/**
 * 获取 provider
 * 浏览器：优先使用 MetaMask
 * SSR / Node：使用 RPC
 */
export function getProvider() {
  if (typeof window !== "undefined" && (window as any).ethereum) {
    return new ethers.BrowserProvider((window as any).ethereum);
  }
  // Node / SSR fallback
  return new ethers.JsonRpcProvider(config.network);
}

/**
 * 获取只读合约
 * 可在浏览器或 SSR 调用 view 方法
 */
export function getContractReadOnly() {
  const provider = getProvider();
  return new ethers.Contract(config.contractAddress, ABI, provider);
}

/**
 * 获取可写合约（需要用户钱包）
 */
export async function getContractWithSigner() {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("No injected wallet found");
  }
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(config.contractAddress, ABI, signer);
}

/**
 * 格式化地址为小写
 */
export function normAddr(a: string) {
  return a ? a.toLowerCase() : a;
}
