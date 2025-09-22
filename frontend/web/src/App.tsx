// App.tsx
import React, { useEffect, useState, useCallback } from "react";
import Particles from "react-tsparticles";
import { loadFull } from "tsparticles";
import { FaStar, FaChartBar, FaUsers, FaQuestionCircle, FaDownload, FaUser, FaMoneyBill, FaCreditCard, FaShieldAlt } from "react-icons/fa";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import { ethers } from "ethers";
import { getContractReadOnly, normAddr, ABI, config } from "./contract";

export default function App() {
  const [account, setAccount] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [singleClient, setSingleClient] = useState({
    age: "",
    income: "",
    clientId: ""
  });
  const [batchData, setBatchData] = useState("");
  const [activeTab, setActiveTab] = useState("single");

  interface Assessment {
    clientId: string;
    creditLimit: ethers.BigNumberish;
    riskScore: ethers.BigNumberish;
    approved: boolean;
    timestamp: ethers.BigNumberish;
  }

  const particlesInit = useCallback(async (engine: any) => {
    await loadFull(engine);
  }, []);

  useEffect(() => {
    console.log("=== APP INITIALIZATION ===");
    console.log("Environment:", process.env.NODE_ENV);
    console.log("Contract config:", config);
    console.log("Using ABI:", ABI ? "Loaded" : "Not loaded");
    
    loadAssessments().finally(() => setLoading(false));
  }, []);

  const checkAdmin = async (addr: string) => {
    try {
      console.log("Checking admin status for address:", addr);
      const contract = await getContractReadOnly();
      if (!contract) {
        console.error("Contract not available for admin check");
        return;
      }
      const adminAddr: string = await contract.getOwner();
      console.log("Contract owner address:", adminAddr);
      const isAdmin = normAddr(addr) === normAddr(adminAddr);
      console.log("Is admin:", isAdmin);
      setIsAdmin(isAdmin);
    } catch (e) {
      console.error("Failed to check admin", e);
      setIsAdmin(false);
    }
  };

  const onWalletSelect = async (wallet: any) => {
    console.log("Wallet selected:", wallet?.name || "Unknown wallet");
    if (!wallet.provider) {
      console.error("No provider in selected wallet");
      return;
    }
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      console.log("Connected account:", acc);
      setAccount(acc);
      await checkAdmin(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        console.log("Accounts changed:", accounts);
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
        await checkAdmin(newAcc);
      });
    } catch (e) {
      console.error("Failed to connect wallet", e);
      alert("Failed to connect wallet: " + e);
    }
  };

  const onConnect = () => {
    console.log("Wallet connection initiated");
    setWalletSelectorOpen(true);
  };
  
  const onDisconnect = () => {
    console.log("Wallet disconnected");
    setAccount("");
    setIsAdmin(false);
    setProvider(null);
  };

  // ----------------- Load Assessments -----------------
  const loadAssessments = async () => {
    console.log("=== LOADING ASSESSMENTS ===");
    try {
      console.log("Getting read-only contract instance...");
      const contract = await getContractReadOnly();
      if (!contract) {
        console.error("Failed to get contract instance");
        return;
      }
      
      console.log("Contract address:", contract.target);
      console.log("Calling getAllClientIds...");
      
      // Get all client IDs
      const clientIds = await contract.getAllClientIds();
      console.log("Client IDs received:", clientIds);
      console.log("Number of client IDs:", clientIds.length);
      
      // Get assessments for each client
      const assessmentList: Assessment[] = [];
      for (let i = 0; i < clientIds.length; i++) {
        try {
          console.log(`Getting assessment for client ${i}: ${clientIds[i]}`);
          const result = await contract.getAssessmentResult(clientIds[i]);
          console.log(`Assessment result for ${clientIds[i]}:`, result);
          
          assessmentList.push({
            clientId: clientIds[i],
            creditLimit: result.creditLimit,
            riskScore: result.riskScore,
            approved: result.approved,
            timestamp: result.timestamp
          });
        } catch (e) {
          console.warn(`Failed to load assessment for ${clientIds[i]}`, e);
        }
      }
      
      console.log("Total assessments loaded:", assessmentList.length);
      setAssessments(assessmentList);
    } catch (e) {
      console.error("Failed to load assessments", e);
      // 添加更详细的错误信息
      if (e instanceof Error) {
        console.error("Error details:", {
          message: e.message,
          stack: e.stack,
          code: (e as any).code,
          data: (e as any).data
        });
      }
    }
  };

  // ----------------- Single Assessment -----------------
  const assessSingleClient = async () => {
    console.log("=== SINGLE ASSESSMENT ===");
    if (!provider) { 
      console.error("No provider available");
      alert("Please connect wallet first"); 
      return; 
    }
    if (!singleClient.age || !singleClient.income || !singleClient.clientId) {
      console.error("Missing form data:", singleClient);
      alert("Please fill all fields"); 
      return;
    }

    try {
      console.log("Getting signer...");
      const signer = await provider.getSigner();
      console.log("Signer address:", await signer.getAddress());
      
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);
      console.log("Contract with signer created at:", contract.target);
      
      // Convert income to USDT units (6 decimals)
      const incomeInUSDT = ethers.parseUnits(singleClient.income, 6);
      console.log("Income converted to USDT units:", incomeInUSDT);
      
      console.log("Calling assessRisk with params:", {
        age: parseInt(singleClient.age),
        income: incomeInUSDT,
        clientId: singleClient.clientId
      });
      
      const tx = await contract.assessRisk(
        parseInt(singleClient.age),
        incomeInUSDT,
        singleClient.clientId
      );
      
      console.log("Transaction sent, hash:", tx.hash);
      await tx.wait();
      console.log("Transaction confirmed");
      
      // Reload assessments after delay
      setTimeout(loadAssessments, 3000);
      
      // Clear form
      setSingleClient({
        age: "",
        income: "",
        clientId: ""
      });
      
      alert("Assessment completed!");
    } catch (e: any) {
      console.error("Assessment failed", e);
      alert("Assessment failed: " + (e?.message || e));
    }
  };

  // ----------------- Batch Assessment -----------------
  const assessBatchClients = async () => {
    if (!provider) { alert("Please connect wallet first"); return; }
    if (!batchData) { alert("Please enter batch data"); return; }

    try {
      // Parse batch data (format: age,income,clientId)
      const lines = batchData.split('\n').filter(line => line.trim() !== '');
      const ages: number[] = [];
      const incomes: bigint[] = [];
      const clientIds: string[] = [];
      
      for (const line of lines) {
        const [age, income, clientId] = line.split(',');
        ages.push(parseInt(age.trim()));
        // Convert income to USDT units (6 decimals)
        incomes.push(ethers.parseUnits(income.trim(), 6));
        clientIds.push(clientId.trim());
      }
      
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);
      
      const tx = await contract.batchAssessRisk(ages, incomes, clientIds);
      await tx.wait();
      
      // Reload assessments after delay
      setTimeout(loadAssessments, 3000);
      
      // Clear batch data
      setBatchData("");
      
      alert(`Batch assessment completed for ${lines.length} clients!`);
    } catch (e: any) {
      console.error("Batch assessment failed", e);
      alert("Batch assessment failed: " + (e?.message || e));
    }
  };

  // ----------------- Download Results -----------------
  const downloadResults = () => {
    if (assessments.length === 0) return;
    
    const csvContent = [
      'Client ID, Credit Limit (USDT), Risk Score, Approved, Timestamp',
      ...assessments.map(a => 
        `${a.clientId}, ${ethers.formatUnits(a.creditLimit, 6)}, ${a.riskScore.toString()}, ${a.approved}, ${new Date(Number(a.timestamp) * 1000).toLocaleString()}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'risk_assessment_results.csv');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div style={{
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      color: "#00f7ff",
      fontSize: "24px",
      fontFamily: "'Orbitron', sans-serif"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: "80px",
          height: "80px",
          border: "5px solid rgba(0, 247, 255, 0.3)",
          borderTop: "5px solid #00f7ff",
          borderRadius: "50%",
          animation: "spin 1.5s linear infinite",
          margin: "0 auto 20px"
        }}></div>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          textTransform: "uppercase",
          letterSpacing: "4px",
          color: "#00f7ff",
          textShadow: "0 0 10px rgba(0, 247, 255, 0.7)"
        }}>
          INITIALIZING SECURE ENVIRONMENT
        </div>
      </div>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );

  // ----------------- Aggregate Stats -----------------
  const totalAssessments = assessments.length;
  const approvedCount = assessments.filter(a => a.approved).length;
  const approvalRate = totalAssessments > 0 ? (approvedCount / totalAssessments) * 100 : 0;
  const totalCredit = assessments.reduce((sum, a) => sum + Number(ethers.formatUnits(a.creditLimit, 6)), 0);

  return (
    <div style={{ 
      fontFamily: "'Rajdhani', sans-serif", 
      minHeight: "100vh", 
      padding: 0,
      position: "relative",
      overflowX: "hidden",
      color: "#e0e0ff",
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)"
    }}>
      {/* Particle Background */}
      <Particles
        id="tsparticles"
        init={particlesInit}
        options={{
          fullScreen: { enable: true, zIndex: 0 },
          particles: {
            number: { value: 80 },
            color: { value: ["#00f7ff", "#ff00c8", "#00ff9d"] },
            shape: { type: "circle" },
            opacity: { value: 0.5, random: true },
            size: { value: 3, random: true },
            move: {
              enable: true,
              speed: 2,
              direction: "none",
              random: true,
              straight: false,
              out_mode: "out",
              bounce: false
            },
            links: {
              enable: true,
              distance: 150,
              color: "#00f7ff",
              opacity: 0.4,
              width: 1
            }
          },
          interactivity: {
            events: {
              onHover: { enable: true, mode: "repulse" },
              onClick: { enable: true, mode: "push" }
            }
          }
        }}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      />

      {/* Cyber Header */}
      <header style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        marginBottom: 32, 
        alignItems: "center",
        padding: "20px 40px",
        position: "relative",
        zIndex: 10,
        borderBottom: "1px solid rgba(0, 247, 255, 0.3)",
        background: "rgba(10, 15, 41, 0.7)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 20px rgba(0, 247, 255, 0.2)"
      }}>
        <div>
          <h1 style={{ 
            fontSize: "2.5rem", 
            fontWeight: 700, 
            margin: 0, 
            background: "linear-gradient(45deg, #00f7ff, #ff00c8)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 10px rgba(0, 247, 255, 0.5)",
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: "2px"
          }}>
            CRYPTOSHIELD RISK
          </h1>
          <div style={{
            fontSize: "1rem",
            color: "#00f7ff",
            letterSpacing: "4px",
            textTransform: "uppercase",
            marginTop: "-5px"
          }}>
            FHE-POWERED SECURE ASSESSMENT
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {assessments.length > 0 && (
            <button 
              onClick={downloadResults}
              style={{
                padding: "12px 24px",
                background: "rgba(0, 247, 255, 0.1)",
                color: "#00f7ff",
                border: "1px solid #00f7ff",
                borderRadius: "0",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: "1px",
                textTransform: "uppercase",
                boxShadow: "0 0 10px rgba(0, 247, 255, 0.3)",
                transition: "all 0.3s ease",
                position: "relative",
                overflow: "hidden"
              }}
            >
              <FaDownload />
              <span>Export Data</span>
            </button>
          )}
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>

      {/* Main Content */}
      <div style={{ 
        position: "relative", 
        zIndex: 5, 
        maxWidth: "1400px", 
        margin: "0 auto", 
        padding: "0 20px"
      }}>
        {/* Hero Section */}
        <section style={{ 
          marginBottom: 50,
          padding: "40px",
          background: "rgba(10, 15, 41, 0.5)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(0, 247, 255, 0.3)",
          borderRadius: "5px",
          boxShadow: "0 0 30px rgba(0, 247, 255, 0.2)",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "relative", zIndex: 2 }}>
            <h2 style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 15, 
              marginTop: 0,
              color: "#00f7ff",
              fontFamily: "'Orbitron', sans-serif",
              fontSize: "2rem"
            }}>
              <FaShieldAlt /> PRIVACY-FIRST RISK ASSESSMENT
            </h2>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr", 
              gap: 40,
              marginTop: 30
            }}>
              <div>
                <h3 style={{ 
                  color: "#ff00c8", 
                  borderBottom: "1px solid #ff00c8", 
                  paddingBottom: 10,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: "1.5rem"
                }}>
                  <FaStar /> FHE TECHNOLOGY
                </h3>
                <p style={{ lineHeight: 1.7, fontSize: "1.1rem" }}>
                  Our platform uses Fully Homomorphic Encryption (FHE) to perform risk calculations 
                  on encrypted data without ever decrypting it. This revolutionary approach ensures:
                </p>
                <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Complete data privacy during computation</li>
                  <li>Zero exposure of sensitive client information</li>
                  <li>Military-grade security for financial assessments</li>
                  <li>Compliance with global data protection regulations</li>
                </ul>
              </div>
              
              <div>
                <h3 style={{ 
                  color: "#00ff9d", 
                  borderBottom: "1px solid #00ff9d", 
                  paddingBottom: 10,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: "1.5rem"
                }}>
                  <FaChartBar  /> SECURE ANALYTICS
                </h3>
                <p style={{ lineHeight: 1.7, fontSize: "1.1rem" }}>
                  While traditional systems expose sensitive data during processing, our FHE-powered solution:
                </p>
                <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Keeps client data encrypted at all times</li>
                  <li>Performs calculations directly on encrypted data</li>
                  <li>Delivers results without compromising privacy</li>
                  <li>Uses blockchain for immutable audit trails</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Cards */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", 
          gap: 25,
          marginBottom: 50
        }}>
          <div style={{
            background: "rgba(10, 15, 41, 0.7)",
            padding: "25px",
            borderRadius: "5px",
            border: "1px solid rgba(0, 247, 255, 0.3)",
            boxShadow: "0 0 20px rgba(0, 247, 255, 0.2)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{ 
              fontSize: "3rem", 
              fontWeight: "bold", 
              background: "linear-gradient(45deg, #00f7ff, #00ff9d)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              margin: "15px 0"
            }}>
              {totalAssessments}
            </div>
            <div style={{ 
              color: "#00f7ff", 
              fontSize: "1.2rem", 
              textTransform: "uppercase",
              letterSpacing: "2px"
            }}>
              Total Assessments
            </div>
          </div>
          
          <div style={{
            background: "rgba(10, 15, 41, 0.7)",
            padding: "25px",
            borderRadius: "5px",
            border: "1px solid rgba(255, 0, 200, 0.3)",
            boxShadow: "0 0 20px rgba(255, 0, 200, 0.2)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{ 
              fontSize: "3rem", 
              fontWeight: "bold", 
              background: "linear-gradient(45deg, #ff00c8, #ff6e6e)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              margin: "15px 0"
            }}>
              {approvalRate.toFixed(1)}%
            </div>
            <div style={{ 
              color: "#ff00c8", 
              fontSize: "1.2rem", 
              textTransform: "uppercase",
              letterSpacing: "2px"
            }}>
              Approval Rate
            </div>
          </div>
          
          <div style={{
            background: "rgba(10, 15, 41, 0.7)",
            padding: "25px",
            borderRadius: "5px",
            border: "1px solid rgba(0, 255, 157, 0.3)",
            boxShadow: "0 0 20px rgba(0, 255, 157, 0.2)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{ 
              fontSize: "3rem", 
              fontWeight: "bold", 
              background: "linear-gradient(45deg, #00ff9d, #00f7ff)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              margin: "15px 0"
            }}>
              ${totalCredit.toFixed(2)}
            </div>
            <div style={{ 
              color: "#00ff9d", 
              fontSize: "1.2rem", 
              textTransform: "uppercase",
              letterSpacing: "2px"
            }}>
              Credit Distributed
            </div>
          </div>
        </div>

        {/* Assessment Tabs */}
        <div style={{ 
          background: "rgba(10, 15, 41, 0.7)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(0, 247, 255, 0.3)",
          borderRadius: "5px",
          boxShadow: "0 0 30px rgba(0, 247, 255, 0.2)",
          marginBottom: 50,
          overflow: "hidden"
        }}>
          {/* Tab Navigation */}
          <div style={{ 
            display: "flex", 
            borderBottom: "1px solid rgba(0, 247, 255, 0.3)"
          }}>
            <button
              onClick={() => setActiveTab("single")}
              style={{
                flex: 1,
                padding: "20px",
                background: activeTab === "single" ? "rgba(0, 247, 255, 0.1)" : "transparent",
                border: "none",
                color: activeTab === "single" ? "#00f7ff" : "#a0a0ff",
                fontSize: "1.2rem",
                fontWeight: "bold",
                cursor: "pointer",
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: "1px",
                textTransform: "uppercase",
                position: "relative",
                transition: "all 0.3s ease"
              }}
            >
              <FaUser /> Single Assessment
            </button>
            <button
              onClick={() => setActiveTab("batch")}
              style={{
                flex: 1,
                padding: "20px",
                background: activeTab === "batch" ? "rgba(0, 247, 255, 0.1)" : "transparent",
                border: "none",
                color: activeTab === "batch" ? "#00f7ff" : "#a0a0ff",
                fontSize: "1.2rem",
                fontWeight: "bold",
                cursor: "pointer",
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: "1px",
                textTransform: "uppercase",
                position: "relative",
                transition: "all 0.3s ease"
              }}
            >
              <FaUsers /> Batch Processing
            </button>
          </div>
          
          {/* Tab Content */}
          <div style={{ padding: "30px" }}>
            {activeTab === "single" ? (
              <div>
                <h3 style={{ 
                  color: "#00f7ff", 
                  marginTop: 0, 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 10,
                  fontFamily: "'Rajdhani', sans-serif"
                }}>
                  <FaUser /> INDIVIDUAL CLIENT ASSESSMENT
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                  <div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ 
                        display: "block", 
                        marginBottom: 8, 
                        color: "#00f7ff",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        fontSize: "0.9rem"
                      }}>
                        AGE
                      </label>
                      <input
                        type="number"
                        placeholder="Enter client age"
                        value={singleClient.age}
                        onChange={(e) => setSingleClient({...singleClient, age: e.target.value})}
                        style={{ 
                          width: "100%", 
                          padding: "15px", 
                          background: "rgba(0, 10, 30, 0.5)", 
                          border: "1px solid rgba(0, 247, 255, 0.5)", 
                          color: "#00f7ff",
                          borderRadius: "0",
                          fontSize: "1.1rem"
                        }}
                      />
                    </div>
                    
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ 
                        display: "block", 
                        marginBottom: 8, 
                        color: "#00f7ff",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        fontSize: "0.9rem"
                      }}>
                        ANNUAL INCOME (USDT)
                      </label>
                      <input
                        type="number"
                        placeholder="Enter annual income"
                        value={singleClient.income}
                        onChange={(e) => setSingleClient({...singleClient, income: e.target.value})}
                        style={{ 
                          width: "100%", 
                          padding: "15px", 
                          background: "rgba(0, 10, 30, 0.5)", 
                          border: "1px solid rgba(0, 247, 255, 0.5)", 
                          color: "#00f7ff",
                          borderRadius: "0",
                          fontSize: "1.1rem"
                        }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ 
                        display: "block", 
                        marginBottom: 8, 
                        color: "#00f7ff",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        fontSize: "0.9rem"
                      }}>
                        CLIENT ID
                      </label>
                      <input
                        type="text"
                        placeholder="Enter unique client ID"
                        value={singleClient.clientId}
                        onChange={(e) => setSingleClient({...singleClient, clientId: e.target.value})}
                        style={{ 
                          width: "100%", 
                          padding: "15px", 
                          background: "rgba(0, 10, 30, 0.5)", 
                          border: "1px solid rgba(0, 247, 255, 0.5)", 
                          color: "#00f7ff",
                          borderRadius: "0",
                          fontSize: "1.1rem"
                        }}
                      />
                    </div>
                    
                    <button 
                      onClick={assessSingleClient}
                      disabled={!account}
                      style={{ 
                        width: "100%",
                        padding: "15px", 
                        background: "rgba(0, 247, 255, 0.1)", 
                        color: "#00f7ff", 
                        border: "1px solid #00f7ff",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "1.1rem",
                        textTransform: "uppercase",
                        letterSpacing: "2px",
                        marginTop: 30,
                        transition: "all 0.3s ease",
                        position: "relative",
                        overflow: "hidden",
                        opacity: !account ? 0.5 : 1
                      }}
                    >
                      {!account ? "CONNECT WALLET TO BEGIN" : "PROCESS SECURE ASSESSMENT"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ 
                  color: "#00f7ff", 
                  marginTop: 0, 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 10,
                  fontFamily: "'Rajdhani', sans-serif"
                }}>
                  <FaUsers /> BULK CLIENT PROCESSING
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
                  <div>
                    <p style={{ 
                      color: "#a0a0ff", 
                      lineHeight: 1.7,
                      fontSize: "1.1rem"
                    }}>
                      Process multiple clients securely using our FHE-powered batch system. 
                      Data remains encrypted throughout the entire assessment process.
                    </p>
                    <div style={{ 
                      background: "rgba(0, 10, 30, 0.5)", 
                      padding: "20px", 
                      border: "1px solid rgba(0, 247, 255, 0.3)",
                      marginTop: 20
                    }}>
                      <h4 style={{ 
                        color: "#00ff9d", 
                        marginTop: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 10
                      }}>
                        DATA FORMAT
                      </h4>
                      <pre style={{ 
                        color: "#00f7ff", 
                        background: "rgba(0, 0, 0, 0.3)", 
                        padding: "15px",
                        borderRadius: "0",
                        overflowX: "auto"
                      }}>
                        age,income,clientId
                      </pre>
                      <div style={{ 
                        color: "#ff00c8", 
                        marginTop: 10,
                        fontSize: "0.9rem"
                      }}>
                        Example: 35,50000,client-12345
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ 
                      display: "block", 
                      marginBottom: 8, 
                      color: "#00f7ff",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      fontSize: "0.9rem"
                    }}>
                      CLIENT DATA (ONE PER LINE)
                    </label>
                    <textarea
                      placeholder="Enter client data..."
                      value={batchData}
                      onChange={(e) => setBatchData(e.target.value)}
                      rows={8}
                      style={{ 
                        width: "100%", 
                        padding: "15px", 
                        background: "rgba(0, 10, 30, 0.5)", 
                        border: "1px solid rgba(0, 247, 255, 0.5)", 
                        color: "#00f7ff",
                        borderRadius: "0",
                        fontSize: "1.1rem",
                        fontFamily: "'Source Code Pro', monospace"
                      }}
                    />
                    
                    <button 
                      onClick={assessBatchClients}
                      disabled={!account || !batchData}
                      style={{ 
                        width: "100%",
                        padding: "15px", 
                        background: "rgba(0, 247, 255, 0.1)", 
                        color: "#00f7ff", 
                        border: "1px solid #00f7ff",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "1.1rem",
                        textTransform: "uppercase",
                        letterSpacing: "2px",
                        marginTop: 20,
                        transition: "all 0.3s ease",
                        position: "relative",
                        overflow: "hidden",
                        opacity: (!account || !batchData) ? 0.5 : 1
                      }}
                    >
                      PROCESS BATCH ASSESSMENT
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        <section style={{ 
          background: "rgba(10, 15, 41, 0.7)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(0, 247, 255, 0.3)",
          borderRadius: "5px",
          boxShadow: "0 0 30px rgba(0, 247, 255, 0.2)",
          padding: "30px",
          marginBottom: 50
        }}>
          <h2 style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 15, 
            marginTop: 0,
            color: "#00f7ff",
            fontFamily: "'Orbitron', sans-serif",
            fontSize: "1.8rem",
            borderBottom: "1px solid rgba(0, 247, 255, 0.3)",
            paddingBottom: "15px"
          }}>
            <FaChartBar /> SECURE ASSESSMENT RESULTS
          </h2>
          
          {assessments.length === 0 ? (
            <div style={{ 
              textAlign: "center", 
              padding: "50px 0",
              color: "#a0a0ff",
              fontSize: "1.2rem"
            }}>
              No assessments completed yet. Submit a client assessment to see encrypted results.
            </div>
          ) : (
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", 
              gap: 25,
              marginTop: 30
            }}>
              {assessments.map((assessment, index) => (
                <div key={index} style={{ 
                  padding: "25px", 
                  background: "rgba(0, 10, 30, 0.5)",
                  border: `1px solid ${assessment.approved ? "rgba(0, 255, 157, 0.5)" : "rgba(255, 0, 200, 0.5)"}`,
                  boxShadow: `0 0 15px ${assessment.approved ? "rgba(0, 255, 157, 0.3)" : "rgba(255, 0, 200, 0.3)"}`,
                  position: "relative",
                  overflow: "hidden"
                }}>
                  <div style={{ 
                    position: "absolute", 
                    top: 15, 
                    right: 15,
                    background: assessment.approved ? "rgba(0, 255, 157, 0.2)" : "rgba(255, 0, 200, 0.2)",
                    color: assessment.approved ? "#00ff9d" : "#ff00c8",
                    padding: "5px 15px",
                    fontSize: "0.9rem",
                    textTransform: "uppercase",
                    letterSpacing: "1px"
                  }}>
                    {assessment.approved ? "Approved" : "Not Approved"}
                  </div>
                  
                  <h4 style={{ 
                    marginTop: 0, 
                    marginBottom: 20, 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 10,
                    color: "#00f7ff",
                    fontSize: "1.3rem"
                  }}>
                    <FaUser /> {assessment.clientId}
                  </h4>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                    <div>
                      <div style={{ 
                        color: "#a0a0ff", 
                        fontSize: "0.9rem",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>
                        Credit Limit
                      </div>
                      <div style={{ 
                        color: "#00f7ff", 
                        fontSize: "1.5rem",
                        fontWeight: "bold"
                      }}>
                        {ethers.formatUnits(assessment.creditLimit, 6)} USDT
                      </div>
                    </div>
                    
                    <div>
                      <div style={{ 
                        color: "#a0a0ff", 
                        fontSize: "0.9rem",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>
                        Risk Score
                      </div>
                      <div style={{ 
                        color: "#00f7ff", 
                        fontSize: "1.5rem",
                        fontWeight: "bold"
                      }}>
                        {assessment.riskScore.toString()}
                      </div>
                    </div>
                    
                    <div>
                      <div style={{ 
                        color: "#a0a0ff", 
                        fontSize: "0.9rem",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>
                        Assessment Date
                      </div>
                      <div style={{ 
                        color: "#00f7ff", 
                        fontSize: "1.1rem"
                      }}>
                        {new Date(Number(assessment.timestamp) * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div>
                      <div style={{ 
                        color: "#a0a0ff", 
                        fontSize: "0.9rem",
                        textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>
                        Assessment Time
                      </div>
                      <div style={{ 
                        color: "#00f7ff", 
                        fontSize: "1.1rem"
                      }}>
                        {new Date(Number(assessment.timestamp) * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <footer style={{ 
        padding: "30px", 
        textAlign: "center", 
        color: "#a0a0ff",
        fontSize: "0.9rem",
        borderTop: "1px solid rgba(0, 247, 255, 0.3)",
        background: "rgba(10, 15, 41, 0.7)",
        position: "relative",
        zIndex: 10
      }}>
        <div>CRYPTOSHIELD RISK ASSESSMENT SYSTEM | POWERED BY FHE TECHNOLOGY</div>
        <div style={{ marginTop: 10 }}>© 2023 Secure Financial Analytics Platform | All Rights Reserved</div>
      </footer>

      {/* Wallet Selector Modal */}
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}

      {/* Add CSS for cyber effects */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Rajdhani:wght@300;400;500;600;700&display=swap');
          
          input, textarea, button {
            font-family: 'Rajdhani', sans-serif;
          }
          
          input:focus, textarea:focus {
            outline: none;
            box-shadow: 0 0 15px rgba(0, 247, 255, 0.5);
          }
          
          button:hover {
            box-shadow: 0 0 20px rgba(0, 247, 255, 0.7);
            transform: translateY(-3px);
          }
        `}
      </style>
    </div>
  );
}