// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * ScriptVaultRegistry
 * -------------------
 * - 作品与版本的上链登记（仅存摘要/URI），隐私内容不上链
 * - 访问控制（白名单 + 可选到期时间）
 * - 使用 FHE 存储并授权解密“访问 scope”（示例：不同授权级别）
 * - 基础许可发布/购买事件（演示支付流转，后续可扩展分润）
 */
contract ScriptVaultRegistry is SepoliaConfig {
    enum Visibility {
        Public,
        Restricted,
        Private
    }

    struct WorkInfo {
        address author;
        uint256 currentVersionId;
        uint64 createdAt;
        string category; // 可选分类/标签
    }

    struct VersionInfo {
        uint256 workId;
        uint256 versionId;
        string title; // 新增：标题，便于前端识别
        bytes32 contentHash; // 内容摘要（如 SHA-256）
        string metadataURI; // IPFS/Arweave CID 或元数据 URI
        uint256 parentVersionId; // 0 表示无父版本
        Visibility visibility;
        uint64 timestamp;
    }

    struct AccessGrant {
        bool granted;
        uint64 expiry; // 0 表示无到期
    }

    struct LicenseTerms {
        uint256 workId;
        address licensee; // 购买者地址（下单前为 address(0)，下单后填充）
        string terms; // JSON/字符串描述条款
        uint256 priceWei; // 一次性价格（演示用）
        bool active; // 是否可购买
    }

    event VersionCreated(
        address indexed creator,
        uint256 indexed workId,
        uint256 indexed versionId,
        string title,
        bytes32 hash,
        string metadataURI,
        Visibility visibility,
        uint64 timestamp
    );

    event AccessGranted(
        uint256 indexed workId,
        address indexed grantee,
        address indexed granter,
        uint64 expiry
    );

    event AccessRevoked(
        uint256 indexed workId,
        address indexed grantee,
        address indexed revoker
    );

    event LicenseIssued(
        uint256 indexed workId,
        address indexed licensee,
        uint256 indexed licenseId,
        string terms,
        uint256 amount
    );

    event LicenseCreated(
        uint256 indexed workId,
        uint256 indexed licenseId,
        string terms,
        uint256 priceWei
    );

    // 可选：版权 NFT 另行合约实现；此处仅保留事件占位
    event CopyrightNFTMinted(
        uint256 indexed workId,
        uint256 indexed versionId,
        uint256 indexed tokenId
    );

    uint256 public nextWorkId = 1;
    uint256 public nextVersionId = 1;
    uint256 public nextLicenseId = 1;

    mapping(uint256 => WorkInfo) public works; // workId => info
    mapping(uint256 => VersionInfo) public versions; // versionId => info
    mapping(uint256 => uint256[]) public workVersions; // workId => versionId[]

    // 访问控制：workId => grantee => grant
    mapping(uint256 => mapping(address => AccessGrant)) public accessGrants;

    // FHE 示例：对 grantee 存储一段加密 scope（授权级别/使用范围）
    // 注意：scope 的明文不在链上出现，仅以密文存在
    mapping(uint256 => mapping(address => euint32)) private _encryptedScopes;

    // 简单许可条款：licenseId => terms
    mapping(uint256 => LicenseTerms) public licenses;
    // workId => licenseId[]
    mapping(uint256 => uint256[]) public workLicenses;

    modifier onlyAuthor(uint256 workId) {
        require(works[workId].author == msg.sender, "Not work author");
        _;
    }

    function _createWorkIfNeeded(address author, string memory category) internal returns (uint256 workId) {
        // 查找是否已存在属于该作者且 category 相同的作品：为简化，MVP 不做合并，直接新建
        workId = nextWorkId++;
        works[workId] = WorkInfo({
            author: author,
            currentVersionId: 0,
            createdAt: uint64(block.timestamp),
            category: category
        });
    }

    function submitVersion(
        uint256 maybeWorkId, // 0 表示新作品
        string calldata title,
        bytes32 contentHash,
        string calldata metadataURI,
        uint256 parentVersionId,
        Visibility visibility,
        string calldata category
    ) external returns (uint256 workId, uint256 versionId) {
        require(contentHash != bytes32(0), "empty hash");

        if (maybeWorkId == 0) {
            workId = _createWorkIfNeeded(msg.sender, category);
        } else {
            require(works[maybeWorkId].author != address(0), "work not found");
            workId = maybeWorkId;
        }

        versionId = nextVersionId++;
        versions[versionId] = VersionInfo({
            workId: workId,
            versionId: versionId,
            title: title,
            contentHash: contentHash,
            metadataURI: metadataURI,
            parentVersionId: parentVersionId,
            visibility: visibility,
            timestamp: uint64(block.timestamp)
        });
        workVersions[workId].push(versionId);
        works[workId].currentVersionId = versionId;

        emit VersionCreated(
            msg.sender,
            workId,
            versionId,
            title,
            contentHash,
            metadataURI,
            visibility,
            uint64(block.timestamp)
        );
    }

    function getWorkInfo(uint256 workId) external view returns (WorkInfo memory info) {
        require(works[workId].author != address(0), "work not found");
        return works[workId];
    }

    function getWorkVersionsCount(uint256 workId) external view returns (uint256) {
        return workVersions[workId].length;
    }

    function getWorkVersions(uint256 workId) external view returns (uint256[] memory) {
        return workVersions[workId];
    }

    function getVersion(uint256 versionId) external view returns (VersionInfo memory) {
        require(versions[versionId].versionId != 0, "version not found");
        return versions[versionId];
    }

    function getLicense(uint256 licenseId) external view returns (LicenseTerms memory) {
        require(licenseId > 0 && licenseId < nextLicenseId, "license not found");
        return licenses[licenseId];
    }

    function getWorkLicenses(uint256 workId) external view returns (uint256[] memory) {
        return workLicenses[workId];
    }

    function grantAccess(
        uint256 workId,
        address grantee,
        uint64 expiry,
        externalEuint32 scopeExt,
        bytes calldata inputProof
    ) external onlyAuthor(workId) {
        require(grantee != address(0), "zero grantee");

        // 存储授权
        accessGrants[workId][grantee] = AccessGrant({granted: true, expiry: expiry});

        // FHE：从外部密文导入 scope，并授权 grantee 解密
        euint32 scope = FHE.fromExternal(scopeExt, inputProof);
        _encryptedScopes[workId][grantee] = scope;

        // 允许合约自身继续使用（如后续计算），以及授权对象解密
        FHE.allowThis(scope);
        FHE.allow(scope, grantee);

        emit AccessGranted(workId, grantee, msg.sender, expiry);
    }

    /// @notice 提升授权 scope：保留更高的授权级别（同态 max）
    function upgradeScope(
        uint256 workId,
        address grantee,
        externalEuint32 scopeExt,
        bytes calldata inputProof
    ) external onlyAuthor(workId) {
        euint32 current = _encryptedScopes[workId][grantee];
        euint32 incoming = FHE.fromExternal(scopeExt, inputProof);
        // 使用同态 max 选择更大的 scope 等级
        euint32 combined = FHE.max(current, incoming);
        _encryptedScopes[workId][grantee] = combined;
        FHE.allowThis(combined);
        FHE.allow(combined, grantee);
    }

    /// @notice 降低授权 scope：保留更低的授权级别（同态 min）
    function downgradeScope(
        uint256 workId,
        address grantee,
        externalEuint32 scopeExt,
        bytes calldata inputProof
    ) external onlyAuthor(workId) {
        euint32 current = _encryptedScopes[workId][grantee];
        euint32 incoming = FHE.fromExternal(scopeExt, inputProof);
        // 使用同态 min 选择更小的 scope 等级
        euint32 combined = FHE.min(current, incoming);
        _encryptedScopes[workId][grantee] = combined;
        FHE.allowThis(combined);
        FHE.allow(combined, grantee);
    }

    function revokeAccess(uint256 workId, address grantee) external onlyAuthor(workId) {
        accessGrants[workId][grantee] = AccessGrant({granted: false, expiry: 0});
        emit AccessRevoked(workId, grantee, msg.sender);
    }

    function getEncryptedScope(uint256 workId, address grantee) external view returns (euint32) {
        // 返回密文，由前端凭 userDecrypt 解出（需 ACL 授权）
        return _encryptedScopes[workId][grantee];
    }

    function isAccessGranted(uint256 workId, address grantee) public view returns (bool) {
        AccessGrant memory g = accessGrants[workId][grantee];
        if (!g.granted) return false;
        if (g.expiry != 0 && block.timestamp > g.expiry) return false;
        return true;
    }

    function issueLicense(
        uint256 workId,
        string calldata terms,
        uint256 priceWei
    ) external onlyAuthor(workId) returns (uint256 licenseId) {
        licenseId = nextLicenseId++;
        licenses[licenseId] = LicenseTerms({
            workId: workId,
            licensee: address(0),
            terms: terms,
            priceWei: priceWei,
            active: true
        });
        workLicenses[workId].push(licenseId);
        emit LicenseCreated(workId, licenseId, terms, priceWei);
    }

    function buyLicense(uint256 licenseId) external payable {
        LicenseTerms storage lic = licenses[licenseId];
        require(lic.active, "license inactive");
        require(lic.priceWei == msg.value, "incorrect value");
        require(lic.licensee == address(0), "already purchased");

        lic.licensee = msg.sender;
        lic.active = false;

        // 将资金直接转给作者（演示用；生产应考虑分润与多签托管）
        address payable to = payable(works[lic.workId].author);
        (bool ok, ) = to.call{value: msg.value}(new bytes(0));
        require(ok, "transfer failed");

        emit LicenseIssued(lic.workId, msg.sender, licenseId, lic.terms, msg.value);
    }
}


