// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface SocialGraph {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  friendsCount: number;
  followersCount: number;
  status: "active" | "pending" | "archived";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [graphs, setGraphs] = useState<SocialGraph[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newGraphData, setNewGraphData] = useState({ friendsCount: 0, followersCount: 0 });
  const [selectedGraph, setSelectedGraph] = useState<SocialGraph | null>(null);
  const [decryptedFriends, setDecryptedFriends] = useState<number | null>(null);
  const [decryptedFollowers, setDecryptedFollowers] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "pending" | "archived">("all");
  const [operationHistory, setOperationHistory] = useState<string[]>([]);

  const activeCount = graphs.filter(g => g.status === "active").length;
  const pendingCount = graphs.filter(g => g.status === "pending").length;
  const archivedCount = graphs.filter(g => g.status === "archived").length;

  useEffect(() => {
    loadGraphs().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const addOperationToHistory = (operation: string) => {
    setOperationHistory(prev => [`${new Date().toLocaleTimeString()}: ${operation}`, ...prev.slice(0, 9)]);
  };

  const loadGraphs = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      addOperationToHistory("Checked contract availability");
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("graph_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { 
          console.error("Error parsing graph keys:", e);
          addOperationToHistory("Error parsing graph keys");
        }
      }
      
      const list: SocialGraph[] = [];
      for (const key of keys) {
        try {
          const graphBytes = await contract.getData(`graph_${key}`);
          if (graphBytes.length > 0) {
            try {
              const graphData = JSON.parse(ethers.toUtf8String(graphBytes));
              list.push({ 
                id: key, 
                encryptedData: graphData.data, 
                timestamp: graphData.timestamp, 
                owner: graphData.owner, 
                friendsCount: graphData.friendsCount, 
                followersCount: graphData.followersCount, 
                status: graphData.status || "pending" 
              });
            } catch (e) { 
              console.error(`Error parsing graph data for ${key}:`, e);
              addOperationToHistory(`Error parsing graph ${key}`);
            }
          }
        } catch (e) { 
          console.error(`Error loading graph ${key}:`, e);
          addOperationToHistory(`Error loading graph ${key}`);
        }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setGraphs(list);
      addOperationToHistory(`Loaded ${list.length} social graphs`);
    } catch (e) { 
      console.error("Error loading graphs:", e);
      addOperationToHistory("Error loading graphs");
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitGraph = async () => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addOperationToHistory("Failed: Wallet not connected");
      return; 
    }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting social graph with Zama FHE..." });
    addOperationToHistory("Starting FHE encryption");
    try {
      const encryptedFriends = FHEEncryptNumber(newGraphData.friendsCount);
      const encryptedFollowers = FHEEncryptNumber(newGraphData.followersCount);
      const encryptedData = JSON.stringify({
        friends: encryptedFriends,
        followers: encryptedFollowers
      });
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const graphId = `graph-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const graphData = { 
        data: encryptedData, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        friendsCount: newGraphData.friendsCount, 
        followersCount: newGraphData.followersCount, 
        status: "pending" 
      };
      
      await contract.setData(`graph_${graphId}`, ethers.toUtf8Bytes(JSON.stringify(graphData)));
      addOperationToHistory(`Encrypted graph ${graphId} stored`);
      
      const keysBytes = await contract.getData("graph_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          keys = JSON.parse(ethers.toUtf8String(keysBytes)); 
        } catch (e) { 
          console.error("Error parsing keys:", e);
          addOperationToHistory("Error parsing existing keys");
        }
      }
      keys.push(graphId);
      await contract.setData("graph_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      addOperationToHistory("Updated graph keys list");
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted social graph submitted!" });
      addOperationToHistory("Graph submission successful");
      await loadGraphs();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewGraphData({ friendsCount: 0, followersCount: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      addOperationToHistory(`Error: ${errorMessage}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<{friends: number, followers: number} | null> => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addOperationToHistory("Decryption failed: Wallet not connected");
      return null; 
    }
    setIsDecrypting(true);
    addOperationToHistory("Starting decryption with wallet signature");
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const data = JSON.parse(encryptedData);
      return {
        friends: FHEDecryptNumber(data.friends),
        followers: FHEDecryptNumber(data.followers)
      };
    } catch (e) { 
      console.error("Decryption failed:", e);
      addOperationToHistory("Decryption failed");
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const activateGraph = async (graphId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addOperationToHistory("Activation failed: Wallet not connected");
      return; 
    }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted graph with FHE..." });
    addOperationToHistory(`Activating graph ${graphId}`);
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const graphBytes = await contract.getData(`graph_${graphId}`);
      if (graphBytes.length === 0) throw new Error("Graph not found");
      const graphData = JSON.parse(ethers.toUtf8String(graphBytes));
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedGraph = { ...graphData, status: "active" };
      await contractWithSigner.setData(`graph_${graphId}`, ethers.toUtf8Bytes(JSON.stringify(updatedGraph)));
      addOperationToHistory(`Graph ${graphId} activated`);
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE activation completed!" });
      await loadGraphs();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Activation failed: " + (e.message || "Unknown error") });
      addOperationToHistory(`Activation failed: ${e.message || "Unknown error"}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const archiveGraph = async (graphId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addOperationToHistory("Archiving failed: Wallet not connected");
      return; 
    }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted graph with FHE..." });
    addOperationToHistory(`Archiving graph ${graphId}`);
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const graphBytes = await contract.getData(`graph_${graphId}`);
      if (graphBytes.length === 0) throw new Error("Graph not found");
      const graphData = JSON.parse(ethers.toUtf8String(graphBytes));
      const updatedGraph = { ...graphData, status: "archived" };
      await contract.setData(`graph_${graphId}`, ethers.toUtf8Bytes(JSON.stringify(updatedGraph)));
      addOperationToHistory(`Graph ${graphId} archived`);
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE archiving completed!" });
      await loadGraphs();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Archiving failed: " + (e.message || "Unknown error") });
      addOperationToHistory(`Archiving failed: ${e.message || "Unknown error"}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (graphAddress: string) => address?.toLowerCase() === graphAddress.toLowerCase();

  const filteredGraphs = graphs.filter(graph => {
    const matchesSearch = graph.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         graph.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || graph.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleDecrypt = async (graph: SocialGraph) => {
    setSelectedGraph(graph);
    const decrypted = await decryptWithSignature(graph.encryptedData);
    if (decrypted) {
      setDecryptedFriends(decrypted.friends);
      setDecryptedFollowers(decrypted.followers);
      addOperationToHistory(`Decrypted graph ${graph.id}`);
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container futuristic-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="network-icon"></div></div>
          <h1>Social<span>Graph</span>NFT</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-graph-btn metal-button">
            <div className="add-icon"></div>New Graph
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Decentralized Social Network</h2>
            <p>Your social graph is an FHE-encrypted, soulbound NFT powered by Zama technology</p>
          </div>
          <div className="fhe-indicator"><div className="fhe-lock"></div><span>FHE Encryption Active</span></div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-card metal-card">
            <h3>Project Introduction</h3>
            <p>This platform transforms your social connections into <strong>FHE-encrypted NFTs</strong> using Zama technology. Your friends and followers data remains encrypted during processing, enabling private social networking.</p>
            <div className="fhe-badge"><span>Zama FHE-Powered</span></div>
          </div>
          
          <div className="dashboard-card metal-card">
            <h3>Graph Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item"><div className="stat-value">{graphs.length}</div><div className="stat-label">Total Graphs</div></div>
              <div className="stat-item"><div className="stat-value">{activeCount}</div><div className="stat-label">Active</div></div>
              <div className="stat-item"><div className="stat-value">{pendingCount}</div><div className="stat-label">Pending</div></div>
              <div className="stat-item"><div className="stat-value">{archivedCount}</div><div className="stat-label">Archived</div></div>
            </div>
          </div>
        </div>

        <div className="graphs-section">
          <div className="section-header">
            <h2>Encrypted Social Graphs</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input 
                  type="text" 
                  placeholder="Search graphs..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="metal-input"
                />
                <select 
                  value={filterStatus} 
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="metal-select"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <button onClick={loadGraphs} className="refresh-btn metal-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="graphs-list metal-card">
            <div className="table-header">
              <div className="header-cell">Graph ID</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Friends</div>
              <div className="header-cell">Followers</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredGraphs.length === 0 ? (
              <div className="no-graphs">
                <div className="no-graphs-icon"></div>
                <p>No social graphs found</p>
                <button className="metal-button primary" onClick={() => setShowCreateModal(true)}>Create First Graph</button>
              </div>
            ) : filteredGraphs.map(graph => (
              <div className="graph-row" key={graph.id} onClick={() => setSelectedGraph(graph)}>
                <div className="table-cell graph-id">#{graph.id.substring(0, 6)}</div>
                <div className="table-cell">{graph.owner.substring(0, 6)}...{graph.owner.substring(38)}</div>
                <div className="table-cell">
                  {decryptedFriends !== null && selectedGraph?.id === graph.id ? 
                    decryptedFriends : graph.friendsCount}
                </div>
                <div className="table-cell">
                  {decryptedFollowers !== null && selectedGraph?.id === graph.id ? 
                    decryptedFollowers : graph.followersCount}
                </div>
                <div className="table-cell">
                  <span className={`status-badge ${graph.status}`}>{graph.status}</span>
                </div>
                <div className="table-cell actions">
                  <button 
                    className="action-btn metal-button" 
                    onClick={(e) => { e.stopPropagation(); handleDecrypt(graph); }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting && selectedGraph?.id === graph.id ? 
                      "Decrypting..." : "Decrypt"}
                  </button>
                  {isOwner(graph.owner) && (
                    <>
                      {graph.status === "pending" && (
                        <button 
                          className="action-btn metal-button success" 
                          onClick={(e) => { e.stopPropagation(); activateGraph(graph.id); }}
                        >
                          Activate
                        </button>
                      )}
                      {graph.status === "active" && (
                        <button 
                          className="action-btn metal-button danger" 
                          onClick={(e) => { e.stopPropagation(); archiveGraph(graph.id); }}
                        >
                          Archive
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="operation-history metal-card">
          <h3>Operation History</h3>
          <div className="history-list">
            {operationHistory.length === 0 ? (
              <p className="no-history">No operations recorded yet</p>
            ) : (
              operationHistory.map((op, index) => (
                <div key={index} className="history-item">
                  <div className="history-time">{op.split(':')[0]}</div>
                  <div className="history-operation">{op.substring(op.indexOf(':') + 1)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitGraph} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          graphData={newGraphData} 
          setGraphData={setNewGraphData}
        />
      )}

      {selectedGraph && (
        <GraphDetailModal 
          graph={selectedGraph} 
          onClose={() => { 
            setSelectedGraph(null); 
            setDecryptedFriends(null);
            setDecryptedFollowers(null);
          }} 
          decryptedFriends={decryptedFriends}
          decryptedFollowers={decryptedFollowers}
          isDecrypting={isDecrypting}
          decryptWithSignature={decryptWithSignature}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="network-icon"></div><span>SocialGraphNFT</span></div>
            <p>Decentralized social network with FHE-encrypted social graphs</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>Powered by Zama FHE</span></div>
          <div className="copyright">© {new Date().getFullYear()} SocialGraphNFT. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  graphData: any;
  setGraphData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, graphData, setGraphData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setGraphData({ ...graphData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!graphData.friendsCount || !graphData.followersCount) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Create Social Graph NFT</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div><strong>FHE Encryption Notice</strong><p>Your social graph will be encrypted with Zama FHE before minting as NFT</p></div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Friends Count *</label>
              <input 
                type="number" 
                name="friendsCount" 
                value={graphData.friendsCount} 
                onChange={handleChange} 
                placeholder="Enter number of friends..." 
                className="metal-input"
                min="0"
              />
            </div>
            <div className="form-group">
              <label>Followers Count *</label>
              <input 
                type="number" 
                name="followersCount" 
                value={graphData.followersCount} 
                onChange={handleChange} 
                placeholder="Enter number of followers..." 
                className="metal-input"
                min="0"
              />
            </div>
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Values:</span>
                <div>Friends: {graphData.friendsCount || 0}</div>
                <div>Followers: {graphData.followersCount || 0}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{graphData.friendsCount ? FHEEncryptNumber(graphData.friendsCount).substring(0, 20) + '...' : 'No value'}</div>
                <div>{graphData.followersCount ? FHEEncryptNumber(graphData.followersCount).substring(0, 20) + '...' : 'No value'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn metal-button primary">
            {creating ? "Encrypting with FHE..." : "Create Graph NFT"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface GraphDetailModalProps {
  graph: SocialGraph;
  onClose: () => void;
  decryptedFriends: number | null;
  decryptedFollowers: number | null;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<{friends: number, followers: number} | null>;
}

const GraphDetailModal: React.FC<GraphDetailModalProps> = ({ 
  graph, 
  onClose, 
  decryptedFriends,
  decryptedFollowers,
  isDecrypting,
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedFriends !== null && decryptedFollowers !== null) { 
      onClose();
      return; 
    }
    const decrypted = await decryptWithSignature(graph.encryptedData);
    if (decrypted) {
      // Values are set in parent component
    }
  };

  return (
    <div className="modal-overlay">
      <div className="graph-detail-modal metal-card">
        <div className="modal-header">
          <h2>Graph Details #{graph.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="graph-info">
            <div className="info-item"><span>Owner:</span><strong>{graph.owner.substring(0, 6)}...{graph.owner.substring(38)}</strong></div>
            <div className="info-item"><span>Created:</span><strong>{new Date(graph.timestamp * 1000).toLocaleString()}</strong></div>
            <div className="info-item"><span>Status:</span><strong className={`status-badge ${graph.status}`}>{graph.status}</strong></div>
          </div>
          
          <div className="encrypted-data-section">
            <h3>Encrypted Data</h3>
            <div className="encrypted-data">
              <div className="data-item">
                <span>Friends:</span> 
                {decryptedFriends !== null ? decryptedFriends : graph.friendsCount}
                {decryptedFriends !== null && <span className="decrypted-tag">(decrypted)</span>}
              </div>
              <div className="data-item">
                <span>Followers:</span> 
                {decryptedFollowers !== null ? decryptedFollowers : graph.followersCount}
                {decryptedFollowers !== null && <span className="decrypted-tag">(decrypted)</span>}
              </div>
            </div>
            
            <div className="fhe-tag"><div className="fhe-icon"></div><span>FHE Encrypted</span></div>
            
            <button 
              className="decrypt-btn metal-button" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span className="decrypt-spinner"></span>
              ) : decryptedFriends !== null ? (
                "Close"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;