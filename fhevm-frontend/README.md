# ScriptVault Frontend (Sepolia + Local Mock)

## 本地 Mock

```sh
cd ../fhevm-hardhat
npx hardhat node
npx hardhat deploy --network localhost

cd ../fhevm-frontend
npm i
npm run dev:mock
```

## Sepolia

```sh
cd ../fhevm-hardhat
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npx hardhat vars set ETHERSCAN_API_KEY # 可选
npm run deploy:sepolia

cd ../fhevm-frontend
npm i
npm run dev
```

部署后合约 ABI 与地址会写入 `public/abi/`，前端会自动加载。



