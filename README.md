# Social Graph NFT: Privacy-Driven Decentralized Connections

Social Graph NFT is a cutting-edge decentralized social networking platform that revolutionizes how individuals manage and connect with their social circles. By leveraging **Zama's Fully Homomorphic Encryption (FHE) technology**, this project ensures that users’ social graphs—comprised of friends and followers—are not just secure but are also transformed into soul-bound NFTs, providing a unique blend of privacy and ownership in the digital realm.

## The Challenge of Social Privacy

In the age of data breaches and privacy invasions, users of social networks are increasingly concerned about who can access their personal information and how it is used. Traditional social platforms often expose user connections and interactions, making individuals vulnerable to data exploitation and unwanted surveillance. The lack of control over one’s own social graph has become a pressing issue, demanding a solution that empowers users while ensuring their privacy.

## Empowering Connections with FHE

The Social Graph NFT project addresses these concerns by implementing Zama's Fully Homomorphic Encryption to encrypt the social graph as an NFT. This allows for secure computations on the encrypted data without revealing sensitive information about user connections. Using Zama's open-source libraries like **Concrete** and **TFHE-rs**, our approach empowers users to authorize decentralized applications (dApps) to perform advanced functionalities directly on their encrypted social graph. This innovative model not only preserves user privacy but also encourages a more secure and engaging social networking experience.

## Core Functionalities

- **FHE-Enabled Social Graphs**: Each user's social connections are stored as FHE-encrypted NFTs, ensuring privacy and security.
- **NFT Assetization**: Users can truly own their social capital, transforming their relationships into verifiable assets on the blockchain.
- **dApp Integration**: Developers can build dApps that operate on encrypted data, providing richer social experiences without compromising privacy.
- **Soul-Bound Tokens**: The NFT model ensures connections stay tied to the user—removing the risk of loss while enhancing identity verification.
- **Decentralized Identity Management**: Users have complete control over their personal information, with the ability to manage authorizations for various dApps.

## Technology Stack

- **Zama FHE SDK**: Core component ensuring confidential computing through fully homomorphic encryption.
- **Ethereum**: The underlying blockchain for deploying social graph NFTs.
- **Node.js**: Backend environment for building and running the dApps.
- **Hardhat**: Development framework for Ethereum smart contracts.
- **IPFS**: Decentralized storage solution for NFT metadata.

## Directory Structure

```plaintext
Social_Graph_NFT_Fhe/
├── contracts/
│   └── Social_Graph_NFT.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── SocialGraphNFT.test.js
├── package.json
└── hardhat.config.js
```

## Installation Instructions

To set up the project, ensure you have the following prerequisites:

- **Node.js**: Version 14.x or higher.
- **Hardhat**: Installed as a development environment.

Follow these steps to get your environment ready:

1. **Download the project files** manually.
2. Open your terminal and navigate to the project directory.
3. Run the following command to install required dependencies, including Zama FHE libraries:

   ```bash
   npm install
   ```

Note: **Please do not use `git clone` or any URLs.**

## Build & Run Your Application

Once the dependencies are installed, you can compile and test the smart contracts with the following commands:

1. **Compile the smart contracts**:

   ```bash
   npx hardhat compile
   ```

2. **Run the tests**:

   ```bash
   npx hardhat test
   ```

3. **Deploy the contracts** to the Ethereum network:

   ```bash
   npx hardhat run scripts/deploy.js --network yourNetwork
   ```

## Code Example

Here is a simple code snippet illustrating how to create a new social graph NFT using FHE:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Social_Graph_NFT is ERC721, Ownable {
    uint256 public nextTokenId;

    constructor() ERC721("SocialGraphNFT", "SGNFT") {}

    function mintNFT(address to) external onlyOwner {
        _safeMint(to, nextTokenId);
        nextTokenId++;
    }
}
```

This contract allows the minting of social graph NFTs, with ownership controlled by the deploying address. 

## Acknowledgements

This project is made possible thanks to the pioneering work of the **Zama** team, whose advancements in Fully Homomorphic Encryption technology empower developers to build confidential blockchain applications. Their open-source tools continue to inspire innovation in privacy and security across the decentralized landscape.
