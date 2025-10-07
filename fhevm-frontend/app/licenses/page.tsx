"use client";

import { useEffect, useState, useRef } from "react";
import { JsonRpcProvider, ethers } from "ethers";
import { loadRelayerInstance } from "../sepolia.client";

export default function LicensesPage() {
  const [abi, setAbi] = useState<any>(null);
  const [contractAddress, setContractAddress] = useState<string>("");

  const [workId, setWorkId] = useState<string>("1");
  const [terms, setTerms] = useState<string>("{" + '"use":"commercial"' + "}");
  const [priceEth, setPriceEth] = useState<string>("0.01");

  const [licenses, setLicenses] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");
  const [currentAddress, setCurrentAddress] = useState<string>("");
  const [workAuthor, setWorkAuthor] = useState<string>("");
  const relayerRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [abiJson, addrMap] = await Promise.all([
          fetch("/abi/ScriptVaultRegistryABI.json").then((r) => r.json()),
          fetch("/abi/ScriptVaultRegistryAddresses.json").then((r) => r.json()),
        ]);
        setAbi(abiJson);
        const addr = addrMap["sepolia"] || addrMap["localhost"] || "";
        setContractAddress(addr);
      } catch {}
    };
    init();
  }, []);

  const provider = () => (window as any).ethereum ? new ethers.BrowserProvider((window as any).ethereum) : new JsonRpcProvider("https://sepolia.infura.io/v3/");

  const loadCurrentAddress = async () => {
    try {
      const prov = provider();
      const signer = await prov.getSigner();
      const addr = (await signer.getAddress()) as string;
      setCurrentAddress(addr);
    } catch {}
  };

  useEffect(() => {
    loadCurrentAddress();
    const eth = (window as any).ethereum;
    if (eth && eth.on) {
      const handler = () => loadCurrentAddress();
      eth.on("accountsChanged", handler);
      return () => eth.removeListener("accountsChanged", handler);
    }
  }, []);

  const refreshLicenses = async () => {
    if (!abi || !contractAddress) return;
    try {
      const signerOrProv = await provider().getSigner().catch(() => provider());
      const contract = new ethers.Contract(contractAddress, abi, signerOrProv);

      // 读取作者
      try {
        const info = await contract.getWorkInfo(parseInt(workId) || 1);
        setWorkAuthor(info.author as string);
      } catch {}

      const ids: bigint[] = await contract.getWorkLicenses(parseInt(workId) || 1);
      const list: any[] = [];
      for (const id of ids) {
        const lic = await contract.getLicense(id);
        const plain = {
          id,
          workId: lic.workId as bigint,
          licensee: (lic.licensee as string) ?? ethers.ZeroAddress,
          terms: lic.terms as string,
          priceWei: (lic.priceWei as bigint) ?? 0n,
          active: Boolean(lic.active),
        };
        list.push(plain);
      }
      setLicenses(list);
    } catch (e: any) {
      setStatus("Load failed: " + (e?.shortMessage || e?.message || String(e)));
    }
  };

  useEffect(() => {
    refreshLicenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abi, contractAddress, workId, currentAddress]);

  const createLicense = async () => {
    if (!abi || !contractAddress) return;
    try {
      setStatus("Creating license...");
      const prov = provider();
      const signer = await prov.getSigner();
      const contract = new ethers.Contract(contractAddress, abi, signer);
      const tx = await contract.issueLicense(parseInt(workId) || 1, terms, ethers.parseEther(priceEth));
      await tx.wait();
      setStatus("License created.");
      refreshLicenses();
    } catch (e: any) {
      setStatus("Create failed: " + (e?.shortMessage || e?.message || String(e)));
    }
  };

  const buyLicense = async (id: bigint, priceWei: bigint) => {
    if (!abi || !contractAddress) return;
    try {
      setStatus("Purchasing license...");
      const prov = provider();
      const signer = await prov.getSigner();
      const contract = new ethers.Contract(contractAddress, abi, signer);
      const tx = await contract.buyLicense(id, { value: priceWei });
      await tx.wait();
      setStatus("Purchased.");
      refreshLicenses();
    } catch (e: any) {
      setStatus("Purchase failed: " + (e?.shortMessage || e?.message || String(e)));
    }
  };

  const formatPrice = (v: any) => {
    try {
      if (v === null || v === undefined) return "0";
      const big = typeof v === "bigint" ? v : BigInt(v);
      return ethers.formatEther(big);
    } catch {
      return "0";
    }
  };

  const isAuthor = currentAddress && workAuthor && currentAddress.toLowerCase() === workAuthor.toLowerCase();

  // Grant Access using Relayer SDK (author only)
  const grantAccessTo = async (licensee: string, scopeLevel: number = 1, expiry: number = 0) => {
    if (!isAuthor || !abi || !contractAddress) return;
    try {
      setStatus(`Granting access to ${licensee} ...`);
      if (!relayerRef.current) {
        relayerRef.current = await loadRelayerInstance();
      }
      const prov = provider();
      const signer = await prov.getSigner();
      const contract = new ethers.Contract(contractAddress, abi, signer);
      const author = await signer.getAddress();

      // 准备加密输入
      const input = relayerRef.current.createEncryptedInput(contractAddress, author);
      input.add32(BigInt(scopeLevel));
      const enc = await input.encrypt();

      const tx = await contract.grantAccess(
        parseInt(workId) || 1,
        licensee,
        expiry,
        enc.handles[0],
        enc.inputProof
      );
      await tx.wait();
      setStatus("Access granted.");
    } catch (e: any) {
      setStatus("Grant failed: " + (e?.shortMessage || e?.message || String(e)));
    }
  };

  // Auto-grant when author is online and LicenseIssued fires
  useEffect(() => {
    let contract: ethers.Contract | null = null;
    const setup = async () => {
      if (!abi || !contractAddress || !isAuthor) return;
      const prov = provider();
      const signerOrProv = await prov.getSigner().catch(() => prov);
      contract = new ethers.Contract(contractAddress, abi, signerOrProv);
      try {
        contract.on("LicenseIssued", async (wId: bigint, licensee: string) => {
          if (Number(wId) === (parseInt(workId) || 1)) {
            try {
              await grantAccessTo(licensee, 1, 0);
              await refreshLicenses();
            } catch {}
          }
        });
      } catch {}
    };
    setup();
    return () => {
      try { contract && contract.removeAllListeners && contract.removeAllListeners("LicenseIssued"); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abi, contractAddress, isAuthor, workId]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-6">Licenses</h1>
      {status && (
        <div className="card bg-white/5 border-white/10 text-gray-300 mb-6">{status}</div>
      )}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="card bg-white">
          <h2 className="text-xl font-semibold text-primary mb-3">Create License</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Work ID</label>
              <input className="input-field" value={workId} onChange={(e)=>setWorkId(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Terms (JSON)</label>
              <textarea className="input-field" rows={4} value={terms} onChange={(e)=>setTerms(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Price (ETH)</label>
              <input className="input-field" value={priceEth} onChange={(e)=>setPriceEth(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={createLicense} disabled={!isAuthor}>Create</button>
            {!isAuthor && (<p className="text-xs text-gray-500">Only the work author can create licenses for this work.</p>)}
          </div>
        </div>

        <div className="card bg-white">
          <h2 className="text-xl font-semibold text-primary mb-3">My Purchases</h2>
          <div className="space-y-3">
            {licenses.length === 0 && (
              <p className="text-sm text-gray-600">No licenses for this work yet.</p>
            )}
            {licenses.map((lic) => {
              const sold = !lic.active && lic.licensee && lic.licensee !== ethers.ZeroAddress;
              const alreadyMine = sold && currentAddress && lic.licensee.toLowerCase() === currentAddress.toLowerCase();
              return (
                <div key={String(lic.id)} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-primary">License #{String(lic.id)}</div>
                    <div className="text-xs text-gray-600">Terms: {lic.terms}</div>
                    <div className="text-xs text-gray-500">Price: {formatPrice(lic.priceWei)} ETH</div>
                    <div className="text-xs text-gray-500">Active: {lic.active ? 'true' : 'false'}</div>
                    <div className="text-xs text-gray-500">Licensee: {lic.licensee}</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {sold ? (
                      <>
                        <span className="text-xs text-gray-500">{alreadyMine ? 'Purchased by you' : 'Sold'}</span>
                        {isAuthor && (
                          <button className="btn-secondary" onClick={() => grantAccessTo(lic.licensee, 1, 0)}>Grant Access</button>
                        )}
                      </>
                    ) : isAuthor ? (
                      <span className="text-xs text-gray-500">Seller view</span>
                    ) : (
                      <button className="btn-secondary" onClick={() => buyLicense(lic.id, lic.priceWei)}>Buy</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}


