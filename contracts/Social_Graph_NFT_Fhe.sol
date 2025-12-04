pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract SocialGraphNftFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error InvalidArgument();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error AlreadyInitialized();
    error NotInitialized();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event CooldownSecondsUpdated(uint256 oldCooldown, uint256 newCooldown);
    event Paused(address account);
    event Unpaused(address account);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event ConnectionSubmitted(
        address indexed user,
        uint256 indexed batchId,
        uint256 encryptedConnectionsCount
    );
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalConnections);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;

    mapping(uint256 => euint32) public encryptedTotalConnections; // batchId -> euint32
    mapping(uint256 => mapping(address => euint32)) public encryptedUserConnections; // batchId -> user -> euint32
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionCooldown(address submitter) {
        if (block.timestamp < lastSubmissionTime[submitter] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier decryptionCooldown(address requester) {
        if (block.timestamp < lastDecryptionRequestTime[requester] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60; // Default cooldown
        currentBatchId = 0;
        batchOpen = false;
    }

    function addProvider(address provider) external onlyOwner {
        if (provider == address(0)) revert InvalidArgument();
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) revert InvalidArgument();
        delete isProvider[provider];
        emit ProviderRemoved(provider);
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        if (newCooldown == 0) revert InvalidArgument();
        emit CooldownSecondsUpdated(cooldownSeconds, newCooldown);
        cooldownSeconds = newCooldown;
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function openBatch() external onlyProvider whenNotPaused {
        if (batchOpen) revert InvalidArgument(); // Or a more specific error
        currentBatchId++;
        batchOpen = true;
        // Initialize encryptedTotalConnections for the new batch
        encryptedTotalConnections[currentBatchId] = FHE.asEuint32(0);
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyProvider whenNotPaused {
        if (!batchOpen) revert InvalidArgument(); // Or a more specific error
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitEncryptedConnections(
        address user,
        euint32 encryptedCount
    ) external onlyProvider whenNotPaused submissionCooldown(msg.sender) {
        if (!batchOpen) revert BatchClosed();
        if (!encryptedCount.isInitialized()) revert NotInitialized();

        lastSubmissionTime[msg.sender] = block.timestamp;

        encryptedUserConnections[currentBatchId][user] = encryptedCount;
        encryptedTotalConnections[currentBatchId] = encryptedTotalConnections[currentBatchId].add(encryptedCount);

        emit ConnectionSubmitted(user, currentBatchId, FHE.toBytes32(encryptedCount));
    }

    function requestTotalConnectionsDecryption(uint256 batchId)
        external
        onlyProvider
        whenNotPaused
        decryptionCooldown(msg.sender)
    {
        if (batchId == 0 || batchId > currentBatchId) revert InvalidArgument();
        if (!encryptedTotalConnections[batchId].isInitialized()) revert NotInitialized();

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 totalConnections = encryptedTotalConnections[batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(totalConnections);

        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild ciphertexts array in the exact same order as in requestTotalConnectionsDecryption
        euint32 totalConnections = encryptedTotalConnections[decryptionContexts[requestId].batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(totalConnections);

        // State verification: ensure the ciphertexts haven't changed since the request
        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // Proof verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // Decode cleartexts (must match the order of ciphertexts in `cts`)
        uint32 totalConnectionsCleartext = abi.decode(cleartexts, (uint32));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, totalConnectionsCleartext);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 storage e) internal {
        if (!e.isInitialized()) {
            e = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32 storage e) internal view {
        if (!e.isInitialized()) {
            revert NotInitialized();
        }
    }
}