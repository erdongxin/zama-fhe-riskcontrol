// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHE RiskControl
 * @dev A smart contract for privacy-preserving client risk assessment using Zama's FHE technology
 */
contract FHERC {
    // Struct to store risk assessment parameters
    struct RiskParameters {
        euint32 incomeMultiplier;
        euint32 riskThreshold;
    }
    
    // Struct to store encrypted assessment results
    struct EncryptedAssessment {
        euint32 creditLimit; // Encrypted credit limit in USDT
        euint32 riskScore;   // Encrypted risk score
        ebool approved;     // Encrypted approval status
        string clientId;     // Pseudonymous client identifier
        uint256 timestamp;   // Assessment timestamp
    }
    
    // Contract owner address
    address private owner;
    
    // Current risk assessment parameters (encrypted)
    RiskParameters public riskParameters;
    
    // Mapping to store encrypted assessment results by client ID
    mapping(string => EncryptedAssessment) public encryptedAssessments;
    
    // Array to store all client IDs for batch retrieval
    string[] private allClientIds;
    
    // Events to log assessments
    event AssessmentPerformed(
        string indexed clientId,
        bytes encryptedCreditLimit,
        bytes encryptedRiskScore,
        bytes encryptedApproved,
        uint256 timestamp
    );
    
    event BatchAssessmentPerformed(
        uint256 count,
        uint256 timestamp
    );
    
    // Event for parameter updates
    event ParametersUpdated(uint256 timestamp);
    
    // Modifier to restrict functions to owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner can perform this action");
        _;
    }
    
    /**
     * @dev Constructor to initialize contract with default risk parameters
     */
    constructor() {
        owner = msg.sender;
        
        // Set default risk assessment parameters (encrypted)
        riskParameters = RiskParameters({
            incomeMultiplier: FHE.asEuint32(2),   // Credit limit multiplier
            riskThreshold: FHE.asEuint32(50)        // Risk score threshold
        });
    }
    
    /**
     * @dev Perform encrypted risk assessment for a single client
     * @param encryptedAge Client's encrypted age
     * @param encryptedIncome Client's encrypted annual income in USDT
     * @param _clientId Pseudonymous client identifier
     * @return encryptedCreditLimit The approved encrypted credit limit
     * @return encryptedRiskScore The calculated encrypted risk score
     * @return encryptedApproved Encrypted approval status
     */
    function assessRiskEncrypted(
        inEuint32 calldata encryptedAge,
        inEuint32 calldata encryptedIncome,
        string memory _clientId
    ) public returns (euint32 encryptedCreditLimit, euint32 encryptedRiskScore, inEbool encryptedApproved) {
        // Only require client ID to be non-empty
        require(bytes(_clientId).length > 0, "Client ID cannot be empty");
        
        // Calculate encrypted risk score using FHE operations
        encryptedRiskScore = calculateEncryptedRiskScore(encryptedAge, encryptedIncome);
        
        // Determine encrypted approval status based on risk threshold
        encryptedApproved = FHE.gt(encryptedRiskScore, riskParameters.riskThreshold);
        
        // Calculate encrypted credit limit if approved
        encryptedCreditLimit = FHE.mul(
            FHE.div(encryptedIncome, FHE.asEuint32(12)), // Monthly income
            riskParameters.incomeMultiplier
        );
        
        // Only apply credit limit if approved
        encryptedCreditLimit = FHE.cmux(
            encryptedApproved,
            encryptedCreditLimit,
            FHE.asEuint32(0)
        );
        
        // Store encrypted assessment results
        encryptedAssessments[_clientId] = EncryptedAssessment({
            creditLimit: encryptedCreditLimit,
            riskScore: encryptedRiskScore,
            approved: encryptedApproved,
            clientId: _clientId,
            timestamp: block.timestamp
        });
        
        // Add to client IDs array if not already present
        if (!clientIdExists(_clientId)) {
            allClientIds.push(_clientId);
        }
        
        // Emit event with encrypted data for off-chain processing
        emit AssessmentPerformed(
            _clientId,
            FHE.sealoutput(encryptedCreditLimit),
            FHE.sealoutput(encryptedRiskScore),
            FHE.sealoutput(encryptedApproved),
            block.timestamp
        );
        
        return (encryptedCreditLimit, encryptedRiskScore, encryptedApproved);
    }
    
    /**
     * @dev Internal function to calculate encrypted risk score using FHE operations
     * @param encryptedAge Client's encrypted age
     * @param encryptedIncome Client's encrypted annual income
     * @return encryptedRiskScore Calculated encrypted risk score
     */
    function calculateEncryptedRiskScore(
        euint32 encryptedAge,
        euint32 encryptedIncome
    ) internal pure returns (euint32 encryptedRiskScore) {
        // Risk calculation algorithm with FHE operations
        
        // Age factor: Older clients get higher scores (up to 40 points)
        euint32 ageFactor = FHE.cmux(
            FHE.gt(encryptedAge, FHE.asEuint32(40)),
            FHE.asEuint32(40),
            FHE.div(FHE.mul(encryptedAge, FHE.asEuint32(40)), FHE.asEuint32(40))
        );
        
        // Income factor: Higher income clients get higher scores (up to 60 points)
        // Convert USDT to dollars (divide by 10^6) then calculate factor
        euint32 incomeInDollars = FHE.div(encryptedIncome, FHE.asEuint32(10**6));
        euint32 incomeFactor = FHE.cmux(
            FHE.gt(FHE.div(incomeInDollars, FHE.asEuint32(1000)), FHE.asEuint32(60)),
            FHE.asEuint32(60),
            FHE.div(incomeInDollars, FHE.asEuint32(1000))
        );
        
        // Combine factors using FHE addition
        return FHE.add(ageFactor, incomeFactor);
    }
    
    /**
     * @dev Batch assess multiple clients with encrypted data
     * @param encryptedAges Array of encrypted client ages
     * @param encryptedIncomes Array of encrypted client annual incomes
     * @param _clientIds Array of pseudonymous client identifiers
     * @return successCount Number of successfully processed assessments
     */
    function batchAssessRiskEncrypted(
        inEuint32[] calldata encryptedAges,
        inEuint32[] calldata encryptedIncomes,
        string[] memory _clientIds
    ) external returns (uint256 successCount) {
        require(
            encryptedAges.length == encryptedIncomes.length && 
            encryptedIncomes.length == _clientIds.length,
            "Input arrays must have the same length"
        );
        
        successCount = 0;
        for (uint256 i = 0; i < encryptedAges.length; i++) {
            try this.assessRiskEncrypted(encryptedAges[i], encryptedIncomes[i], _clientIds[i]) {
                successCount++;
            } catch {
                // Skip failed assessments and continue with next
                continue;
            }
        }
        
        emit BatchAssessmentPerformed(successCount, block.timestamp);
        return successCount;
    }
    
    /**
     * @dev Retrieve encrypted assessment results for a single client
     * @param _clientId Pseudonymous client identifier
     * @return encryptedCreditLimit Encrypted credit limit
     * @return encryptedRiskScore Encrypted risk score
     * @return encryptedApproved Encrypted approval status
     * @return timestamp Assessment timestamp
     */
    function getEncryptedAssessmentResult(string memory _clientId) public view returns (
        euint32 encryptedCreditLimit,
        euint32 encryptedRiskScore,
        inEbool encryptedApproved,
        uint256 timestamp
    ) {
        require(bytes(_clientId).length > 0, "Client ID cannot be empty");
        EncryptedAssessment memory result = encryptedAssessments[_clientId];
        require(bytes(result.clientId).length > 0, "No assessment found for this client ID");
        
        return (result.creditLimit, result.riskScore, result.approved, result.timestamp);
    }
    
    /**
     * @dev Check if a client ID already exists in the system
     * @param _clientId Client ID to check
     * @return exists Whether the client ID exists
     */
    function clientIdExists(string memory _clientId) private view returns (bool exists) {
        for (uint256 i = 0; i < allClientIds.length; i++) {
            if (keccak256(abi.encodePacked(allClientIds[i])) == keccak256(abi.encodePacked(_clientId))) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @dev Get all client IDs that have been assessed
     * @return Array of all client IDs
     */
    function getAllClientIds() public view returns (string[] memory) {
        return allClientIds;
    }
    
    /**
     * @dev Get the total number of assessments performed
     * @return count Number of assessments
     */
    function getAssessmentCount() public view returns (uint256 count) {
        return allClientIds.length;
    }
    
    /**
     * @dev Update encrypted risk assessment parameters (owner only)
     * @param encryptedMultiplier Encrypted multiplier for credit limit calculation
     * @param encryptedThreshold Encrypted risk score threshold for approval
     */
    function updateRiskParametersEncrypted(
        inEuint32 calldata encryptedMultiplier,
        inEuint32 calldata encryptedThreshold
    ) public onlyOwner {
        riskParameters = RiskParameters({
            incomeMultiplier: FHE.asEuint32(encryptedMultiplier),
            riskThreshold: FHE.asEuint32(encryptedThreshold)
        });
        
        emit ParametersUpdated(block.timestamp);
    }
    
    /**
     * @dev Transfer contract ownership
     * @param _newOwner Address of the new owner
     */
    function transferOwnership(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "New owner cannot be zero address");
        owner = _newOwner;
    }
    
    /**
     * @dev Get contract owner address
     * @return Address of the contract owner
     */
    function getOwner() public view returns (address) {
        return owner;
    }
}