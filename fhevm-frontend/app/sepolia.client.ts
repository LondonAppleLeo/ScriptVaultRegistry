export async function loadRelayerInstance(): Promise<any> {
  if (!("relayerSDK" in window)) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Relayer SDK"));
      document.head.appendChild(s);
    });
  }
  // @ts-ignore
  const sdk = (window as any).relayerSDK;
  await sdk.initSDK();
  const instance = await sdk.createInstance({
    ...sdk.SepoliaConfig,
    network: (window as any).ethereum,
  });
  return instance;
}



