"use client";

import { useEffect, useState } from "react";
import { JsonRpcProvider, ethers } from "ethers";
import { loadRelayerInstance } from "./sepolia.client";

export default function Page() {
  const [status, setStatus] = useState<string>("Initializing...");
  const [network, setNetwork] = useState<string>("sepolia");
  const [instance, setInstance] = useState<any>(null);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [abi, setAbi] = useState<any>(null);
  const [txhash, setTxhash] = useState<string>("");

  // Form states
  const [title, setTitle] = useState<string>("");
  const [hashInput, setHashInput] = useState<string>("");
  const [category, setCategory] = useState<string>("script");
  const [grantTo, setGrantTo] = useState<string>("");
  const [scopeLevel, setScopeLevel] = useState<number>(1);
  const [workId, setWorkId] = useState<string>("1");

  // File upload (Pinata)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cid, setCid] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [pinataJwt, setPinataJwt] = useState<string>(process.env.NEXT_PUBLIC_PINATA_JWT || "");

  const useMock = typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCK === "1";

  useEffect(() => {
    const run = async () => {
      try {
        if (useMock) {
          setStatus("Local Dev Mode: Creating FHEVM Instance...");
          const { MockFhevmInstance } = await import("@fhevm/mock-utils");
          const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
          const meta = await rpc.send("fhevm_relayer_metadata", []);
          const mock = await MockFhevmInstance.create(rpc, rpc, {
            aclContractAddress: meta.ACLAddress,
            chainId: 31337,
            gatewayChainId: 55815,
            inputVerifierContractAddress: meta.InputVerifierAddress,
            kmsContractAddress: meta.KMSVerifierAddress,
            verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
            verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
          });
          setInstance(mock);
          setStatus("Mock Instance Ready");
          setNetwork("localhost");
        } else {
          setStatus("Creating Relayer Instance...");
          const inst = await loadRelayerInstance();
          setInstance(inst);
          setStatus("Relayer Instance Ready (Sepolia)");
          setNetwork("sepolia");
        }

        // Load ABI & Address
        try {
          const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
          const [abiJson, addrMap] = await Promise.all([
            fetch(`${base}/abi/ScriptVaultRegistryABI.json`).then((r) => r.json()),
            fetch(`${base}/abi/ScriptVaultRegistryAddresses.json`).then((r) => r.json()),
          ]);
          setAbi(abiJson);
          const addr = addrMap[useMock ? "localhost" : "sepolia"] || addrMap["sepolia"] || addrMap["localhost"];
          setContractAddress(addr || "");
        } catch {}
      } catch (e: any) {
        setStatus("Initialization Failed: " + (e?.message || String(e)));
      }
    };
    run();
  }, [useMock]);

  const uploadToPinata = async (file: File): Promise<string> => {
    if (!pinataJwt) throw new Error("Pinata JWT is required");
    setUploading(true);
    setUploadProgress(5);
    const form = new FormData();
    form.append("file", file);
    form.append(
      "pinataMetadata",
      JSON.stringify({ name: `scriptvault_${file.name}`, keyvalues: { app: "ScriptVault", title } })
    );

    const resp = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${pinataJwt}` },
      body: form,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Pinata upload failed: ${resp.status} ${text}`);
    }

    setUploadProgress(90);
    const json = await resp.json();
    const ipfsHash = json.IpfsHash || json.Hash || json.cid || "";
    if (!ipfsHash) throw new Error("Invalid Pinata response");
    setUploadProgress(100);
    setUploading(false);
    return ipfsHash;
  };

  const submitVersion = async () => {
    if (!instance || !contractAddress || !abi) return;
    try {
      setStatus("Submitting version...");

      let finalCid = cid;
      if (!finalCid && selectedFile) {
        finalCid = await uploadToPinata(selectedFile);
        setCid(finalCid);
      }
      if (!finalCid) throw new Error("Please upload a file (CID missing)");

      const provider = (window as any).ethereum ? new ethers.BrowserProvider((window as any).ethereum) : new JsonRpcProvider("https://sepolia.infura.io/v3/");
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, abi, signer);

      const hashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(hashInput || title || "demo"));
      const visibility = 1; // Restricted
      const parentVersionId = 0;
      const maybeWorkId = 0;

      const tx = await contract.submitVersion(
        maybeWorkId,
        title || "Untitled",
        hashBytes32,
        finalCid.startsWith("ipfs://") ? finalCid : `ipfs://${finalCid}`,
        parentVersionId,
        visibility,
        category
      );
      const receipt = await tx.wait();
      setTxhash(receipt?.hash ?? tx.hash);
      setStatus("Version submitted successfully!");
    } catch (e: any) {
      setStatus("Submission failed: " + (e?.message || String(e)));
      setUploading(false);
    }
  };

  const grantAccess = async () => {
    if (!instance || !contractAddress || !abi) return;
    try {
      setStatus("Granting access...");
      const provider = (window as any).ethereum ? new ethers.BrowserProvider((window as any).ethereum) : new JsonRpcProvider("https://sepolia.infura.io/v3/");
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, abi, signer);

      const userAddr = await signer.getAddress();
      const input = instance.createEncryptedInput(contractAddress, userAddr);
      input.add32(BigInt(scopeLevel));
      const enc = await input.encrypt();

      const expiry = 0;
      const tx = await contract.grantAccess(
        parseInt(workId) || 1,
        grantTo,
        expiry,
        enc.handles[0],
        enc.inputProof
      );
      const receipt = await tx.wait();
      setTxhash(receipt?.hash ?? tx.hash);
      setStatus("Access granted successfully!");
    } catch (e: any) {
      setStatus("Grant failed: " + (e?.message || String(e)));
    }
  };

  const readableSize = (bytes: number) => {
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB"]; let i = 0; let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${units[i]}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-gray-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-primary/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-serif">ScriptVault</h1>
              <p className="text-xs text-gray-400">Encrypted Script Registry</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1.5 bg-accent/20 border border-accent/30 rounded-full">
              <span className="text-sm text-accent font-medium capitalize">{network}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Status Card */}
        <div className="mb-8 card bg-white/5 backdrop-blur-sm border-white/10">
          <div className="flex items-start gap-4">
            <div className={`w-3 h-3 rounded-full mt-1.5 ${status.includes('Ready') || status.includes('success') ? 'bg-green-500' : status.includes('fail') || status.includes('Failed') ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-400 mb-1">System Status</h3>
              <p className="text-white">{status}</p>
              {contractAddress && (
                <p className="text-sm text-gray-400 mt-2">
                  Contract: <span className="text-accent font-mono">{contractAddress}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {instance ? (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left Column - Create Work */}
            <div className="space-y-6">
              <div className="card bg-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-primary">Create Work</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                    <input className="input-field" placeholder="Your title" value={title} onChange={(e)=>setTitle(e.target.value)} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Content Summary (for hash demo)
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Enter your script summary..."
                      value={hashInput}
                      onChange={(e) => setHashInput(e.target.value)}
                    />
                  </div>

                  {/* Pinata JWT */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pinata JWT (client-side upload)
                    </label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="Paste your Pinata JWT (optional if set in env)"
                      value={pinataJwt}
                      onChange={(e) => setPinataJwt(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">Only used in browser to upload file to IPFS via Pinata.</p>
                  </div>

                  {/* File upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload File (PDF/TXT/DOCX/ZIP/Media)
                    </label>
                    <input
                      type="file"
                      className="input-field"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setSelectedFile(f);
                        setCid("");
                        setUploadProgress(0);
                      }}
                      accept=".pdf,.txt,.doc,.docx,.md,.zip,.png,.jpg,.jpeg,.mp3,.mp4"
                    />
                    {selectedFile && (
                      <div className="mt-2 text-sm text-gray-600 flex items-center justify-between">
                        <span className="truncate mr-3">{selectedFile.name}</span>
                        <span>{readableSize(selectedFile.size)}</span>
                      </div>
                    )}
                    {uploading && (
                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-2 bg-accent rounded-full" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    )}
                    {cid && (
                      <p className="text-xs text-gray-500 mt-2 break-all">CID: {cid}</p>
                    )}
                  </div>

                  <button
                    onClick={submitVersion}
                    className="btn-primary w-full"
                    disabled={!title || (!selectedFile && !cid) || uploading}
                  >
                    {uploading ? "Uploading..." : "Submit Version"}
                  </button>
                </div>
              </div>

              {/* Grant Access Card */}
              <div className="card bg-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-primary">Grant Access</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Work ID
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="1"
                      value={workId}
                      onChange={(e) => setWorkId(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Grantee Address
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="0x..."
                      value={grantTo}
                      onChange={(e) => setGrantTo(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Access Scope Level (Encrypted)
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      placeholder="1"
                      value={scopeLevel}
                      onChange={(e) => setScopeLevel(parseInt(e.target.value || "0"))}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This value will be encrypted using FHE
                    </p>
                  </div>

                  <button
                    onClick={grantAccess}
                    className="btn-secondary w-full"
                    disabled={!grantTo}
                  >
                    Grant Access (FHE Encrypted)
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column - Preview */}
            <div className="space-y-6">
              <div className="card bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-primary">Live Preview</h2>
                </div>

                <div className="space-y-4">
                  <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 border-2 border-dashed border-accent/30">
                    <div className="aspect-video bg-gradient-to-br from-primary/5 to-accent/5 rounded-lg flex items-center justify-center mb-4">
                      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-primary mb-2">
                      {title || "Untitled Work"}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="px-2 py-1 bg-primary/10 rounded-full capitalize">{category}</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-500">{selectedFile ? selectedFile.name : cid ? "IPFS" : "No file"}</span>
                    </div>
                  </div>

                  {txhash && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-green-800 mb-1">Transaction Confirmed</p>
                          <p className="text-xs text-green-600 font-mono break-all">{txhash}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4">
                    <h4 className="font-semibold text-primary mb-3">Features</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                        FHE Encrypted Access Control
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                        Immutable Version History
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                        Timestamp Proof on Sepolia
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                        IPFS Decentralized Storage (Pinata)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-accent animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <p className="text-white">Loading FHEVM Instance...</p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-gray-400">
          <p>Powered by FHEVM • Encrypted with Zama Technology</p>
        </div>
      </footer>
    </div>
  );
}
