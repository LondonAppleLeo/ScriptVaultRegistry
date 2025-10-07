"use client";

import { useEffect, useMemo, useState } from "react";
import { JsonRpcProvider, ethers } from "ethers";
import { loadRelayerInstance } from "../sepolia.client";

type VersionInfo = {
  workId: bigint;
  versionId: bigint;
  title: string;
  contentHash: string;
  metadataURI: string;
  parentVersionId: bigint;
  visibility: number;
  timestamp: bigint;
};

const WORK_ID = 1; // MVP: 展示 workId=1 的版本与解密

export default function WorksPage() {
  const [addresses, setAddresses] = useState<any>({});
  const [abi, setAbi] = useState<any>(null);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Relayer / decrypt
  const [instance, setInstance] = useState<any>(null);
  const [decrypting, setDecrypting] = useState<boolean>(false);
  const [decryptedScope, setDecryptedScope] = useState<string>("");

  // Detail modal
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [detailVersion, setDetailVersion] = useState<VersionInfo | null>(null);
  const [detailScope, setDetailScope] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      try {
        const [abiJson, addrMap] = await Promise.all([
          fetch("/abi/ScriptVaultRegistryABI.json").then((r) => r.json()),
          fetch("/abi/ScriptVaultRegistryAddresses.json").then((r) => r.json()),
        ]);
        setAbi(abiJson);
        setAddresses(addrMap);
        const addr = addrMap["sepolia"] || addrMap["localhost"] || "";
        setContractAddress(addr);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    };
    run();
  }, []);

  useEffect(() => {
    const loadVersions = async () => {
      if (!abi || !contractAddress) return;
      setLoading(true);
      try {
        const provider = (window as any).ethereum ? new ethers.BrowserProvider((window as any).ethereum) : new JsonRpcProvider("https://sepolia.infura.io/v3/");
        const contract = new ethers.Contract(contractAddress, abi, await provider.getSigner().catch(() => provider));
        const ids: bigint[] = await contract.getWorkVersions(WORK_ID);
        const items: VersionInfo[] = [];
        for (const id of ids) {
          const info: VersionInfo = await contract.getVersion(id);
          items.push(info);
        }
        items.sort((a, b) => Number(b.versionId - a.versionId));
        setVersions(items);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    loadVersions();
  }, [abi, contractAddress]);

  useEffect(() => {
    const initRelayer = async () => {
      try {
        const inst = await loadRelayerInstance();
        setInstance(inst);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    };
    initRelayer();
  }, []);

  const getOrCreateDecryptSignature = async (
    relayer: any,
    contracts: string[],
    signer: ethers.Signer
  ) => {
    const user = (await signer.getAddress()).toLowerCase();
    const key = `fhevm:decSig:${user}:${contracts.sort().join(',')}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.signature) return obj;
      }
    } catch {}

    const { publicKey, privateKey } = relayer.generateKeypair();
    const start = Math.floor(Date.now() / 1000);
    const durationDays = 365;
    const eip712 = relayer.createEIP712(publicKey, contracts, start, durationDays);
    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message
    );
    const obj = {
      publicKey,
      privateKey,
      signature,
      contracts,
      start,
      durationDays,
      user,
    };
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
    return obj;
  };

  const clearCachedSignature = () => {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("fhevm:decSig:")) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      setDecryptedScope("");
    } catch {}
  };

  const onDecrypt = async (v?: VersionInfo) => {
    if (!abi || !contractAddress || !instance) return;
    setDecrypting(true);
    setError("");
    try {
      const provider = (window as any).ethereum ? new ethers.BrowserProvider((window as any).ethereum) : new JsonRpcProvider("https://sepolia.infura.io/v3/");
      const signer = await provider.getSigner();
      const userAddr = await signer.getAddress();
      const contract = new ethers.Contract(contractAddress, abi, signer);

      // 读取密文 scope 句柄（bytes32）
      const handle: string = await contract.getEncryptedScope(WORK_ID, userAddr);
      if (!handle || handle === ethers.ZeroHash) {
        setError("No encrypted scope for current user (not granted or expired)");
        setDecrypting(false);
        return;
      }

      // 生成/复用解密签名
      const sig = await getOrCreateDecryptSignature(instance, [contractAddress], signer);

      // 解密（User Decrypt）
      const result = await instance.userDecrypt(
        [{ handle, contractAddress }],
        sig.privateKey,
        sig.publicKey,
        sig.signature,
        sig.contracts,
        userAddr,
        sig.start,
        sig.durationDays
      );

      const value = result[handle];
      setDecryptedScope(String(value));

      if (v) {
        setDetailVersion(v);
        setDetailScope(String(value));
        setDetailOpen(true);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDecrypting(false);
    }
  };

  const ipfsUrl = (uri: string) => {
    if (!uri) return "";
    return uri.startsWith("ipfs://")
      ? `https://gateway.pinata.cloud/ipfs/${uri.replace("ipfs://", "")}`
      : uri;
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-6">My Works</h1>

      {error && (
        <div className="card bg-red-50 border-red-200 text-red-800 mb-6">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="card bg-white/5 backdrop-blur-sm border-white/10 text-gray-300 mb-8">
        <p>Contract</p>
        <pre className="text-xs mt-3 overflow-auto">{JSON.stringify(addresses, null, 2)}</pre>
      </div>

      <div className="card bg-white mb-8">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-xl font-semibold text-primary">Access Scope (workId = {WORK_ID})</h2>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => onDecrypt()} disabled={decrypting || !instance}>
              {decrypting ? "Decrypting..." : "Decrypt Scope"}
            </button>
            <button className="btn-secondary" onClick={clearCachedSignature}>
              Re-sign
            </button>
          </div>
        </div>
        {decryptedScope && (
          <p className="text-sm text-gray-700">Decrypted scope: <span className="font-mono">{decryptedScope}</span></p>
        )}
        {!decryptedScope && <p className="text-sm text-gray-500">Click to decrypt your access scope.</p>}
      </div>

      <div className="card bg-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-primary">Versions (workId = {WORK_ID})</h2>
          {loading ? <span className="text-sm text-gray-500">Loading...</span> : null}
        </div>
        {versions.length === 0 ? (
          <p className="text-sm text-gray-600">No versions yet. Go to Create page to submit one.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {versions.map((v) => (
              <li key={Number(v.versionId)} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-primary truncate">{v.title || `Version #${String(v.versionId)}`}</div>
                  <button className="text-xs text-gray-500 underline" onClick={() => window.open(ipfsUrl(v.metadataURI), "_blank")}>Open IPFS</button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn-secondary" onClick={() => onDecrypt(v)} disabled={decrypting || !instance}>Decrypt</button>
                  <div className="text-xs text-gray-500">#{String(v.versionId)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailOpen && detailVersion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setDetailOpen(false)}>
          <div className="card bg-white w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-primary">{detailVersion.title || `Version #${String(detailVersion.versionId)}`}</h3>
                <p className="text-sm text-gray-600 mt-1">Scope: <span className="font-mono">{detailScope || decryptedScope || '-'}</span></p>
                <p className="text-xs text-gray-500 mt-1 break-all">CID: {detailVersion.metadataURI}</p>
                <button className="text-xs text-accent underline mt-1" onClick={() => window.open(ipfsUrl(detailVersion.metadataURI), "_blank")}>Open in IPFS Gateway</button>
              </div>
              <button className="btn-secondary" onClick={() => setDetailOpen(false)}>Close</button>
            </div>
            <div className="border rounded-lg overflow-hidden h-[60vh]">
              <iframe src={ipfsUrl(detailVersion.metadataURI)} className="w-full h-full" title="ipfs-preview" />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


