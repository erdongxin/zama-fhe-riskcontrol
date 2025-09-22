// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RiskControl
 * @dev A smart contract for financial institutions to assess client risk profiles
 * while maintaining data compliance. Supports single and batch processing of client data
 * and outputs only assessment results (credit limit/risk score/approval status)
 */
contract RiskControl {
    
    // Struct to store risk assessment parameters (configured by contract owner)
    struct RiskParameters {
        uint256 incomeMultiplier;
        uint256 riskThreshold;
    }
    
    // Struct to store assessment results
    struct AssessmentResult {
        uint256 creditLimit; // Credit limit in USDT
        uint256 riskScore;
        bool approved;
        string clientId;
        uint256 timestamp;
    }
    
    // Contract owner address
    address private owner;
    
    // Current risk assessment parameters
    RiskParameters public riskParameters;
    
    // Mapping to store assessment results by client ID
    mapping(string => AssessmentResult) public assessmentResults;
    
    // Array to store all client IDs for batch retrieval
    string[] private allClientIds;
    
    // Events to log assessments
    event AssessmentPerformed(
        string indexed clientId,
        uint256 creditLimit,
        uint256 riskScore,
        bool approved,
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
        
        // Set default risk assessment parameters
        riskParameters = RiskParameters({
            incomeMultiplier: 2, // Credit limit multiplier based on income
            riskThreshold: 50 // Risk score threshold for approval
        });
    }
    
    /**
     * @dev Perform risk assessment for a single client
     * @param _age Client's age
     * @param _annualIncome Client's annual income in USDT (with 6 decimals)
     * @param _clientId Pseudonymous client identifier for compliance
     * @return creditLimit The approved credit limit in USDT
     * @return riskScore The calculated risk score
     * @return approved Whether the client is approved
     */
    function assessRisk(
        uint256 _age,
        uint256 _annualIncome,
        string memory _clientId
    ) public returns (uint256 creditLimit, uint256 riskScore, bool approved) {
        // Only require client ID to be non-empty
        require(bytes(_clientId).length > 0, "Client ID cannot be empty");
        
        // Calculate risk score using internal function
        riskScore = calculateRiskScore(_age, _annualIncome);
        
        // Determine approval status based on risk threshold
        approved = riskScore >= riskParameters.riskThreshold;
        
        // Calculate credit limit if approved (in USDT)
        creditLimit = 0;
        if (approved) {
            creditLimit = (_annualIncome / 12) * riskParameters.incomeMultiplier; // Monthly income * multiplier
        }
        
        // Store assessment results
        assessmentResults[_clientId] = AssessmentResult({
            creditLimit: creditLimit,
            riskScore: riskScore,
            approved: approved,
            clientId: _clientId,
            timestamp: block.timestamp
        });
        
        // Add to client IDs array if not already present
        if (!clientIdExists(_clientId)) {
            allClientIds.push(_clientId);
        }
        
        // Emit event for off-chain tracking
        emit AssessmentPerformed(_clientId, creditLimit, riskScore, approved, block.timestamp);
        
        return (creditLimit, riskScore, approved);
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
     * @dev Internal function to calculate risk score based on age and income
     * @param _age Client's age
     * @param _annualIncome Client's annual income in USDT
     * @return Calculated risk score
     */
    function calculateRiskScore(
        uint256 _age,
        uint256 _annualIncome
    ) internal pure returns (uint256) {
        // Risk calculation algorithm with weighted factors
        
        // Age factor: Older clients get higher scores (up to 40 points)
        uint256 ageFactor = _age > 40 ? 40 : (_age * 40) / 40;
        
        // Income factor: Higher income clients get higher scores (up to 60 points)
        // Convert USDT to dollars (divide by 10^6) then calculate factor
        uint256 incomeInDollars = _annualIncome / 10**6;
        uint256 incomeFactor = (incomeInDollars / 1000) > 60 ? 60 : (incomeInDollars / 1000);
        
        return ageFactor + incomeFactor;
    }
    
    /**
     * @dev Batch assess multiple clients
     * @param _ages Array of client ages
     * @param _incomes Array of client annual incomes in USDT
     * @param _clientIds Array of pseudonymous client identifiers
     * @return successCount Number of successfully processed assessments
     */
    function batchAssessRisk(
        uint256[] memory _ages,
        uint256[] memory _incomes,
        string[] memory _clientIds
    ) external returns (uint256 successCount) {
        require(
            _ages.length == _incomes.length && 
            _incomes.length == _clientIds.length,
            "Input arrays must have the same length"
        );
        
        successCount = 0;
        for (uint256 i = 0; i < _ages.length; i++) {
            try this.assessRisk(_ages[i], _incomes[i], _clientIds[i]) {
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
     * @dev Retrieve assessment results for a single client
     * @param _clientId Pseudonymous client identifier
     * @return creditLimit The approved credit limit in USDT
     * @return riskScore The calculated risk score
     * @return approved Whether the client is approved
     * @return timestamp When the assessment was performed
     */
    function getAssessmentResult(string memory _clientId) public view returns (
        uint256 creditLimit,
        uint256 riskScore,
        bool approved,
        uint256 timestamp
    ) {
        require(bytes(_clientId).length > 0, "Client ID cannot be empty");
        AssessmentResult memory result = assessmentResults[_clientId];
        require(bytes(result.clientId).length > 0, "No assessment found for this client ID");
        
        return (result.creditLimit, result.riskScore, result.approved, result.timestamp);
    }
    
    /**
     * @dev Retrieve assessment results for multiple clients
     * @param _clientIds Array of client IDs to retrieve
     * @return results Array of assessment results
     */
    function getBatchAssessmentResults(
        string[] memory _clientIds
    ) public view returns (AssessmentResult[] memory results) {
        results = new AssessmentResult[](_clientIds.length);
        
        for (uint256 i = 0; i < _clientIds.length; i++) {
            results[i] = assessmentResults[_clientIds[i]];
        }
        
        return results;
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
     * @dev Update risk assessment parameters (owner only)
     * @param _incomeMultiplier Multiplier for credit limit calculation
     * @param _riskThreshold Risk score threshold for approval
     */
    function updateRiskParameters(
        uint256 _incomeMultiplier,
        uint256 _riskThreshold
    ) public onlyOwner {
        riskParameters = RiskParameters({
            incomeMultiplier: _incomeMultiplier,
            riskThreshold: _riskThreshold
        });
        
        emit ParametersUpdated(block.timestamp);
    }
    
    /**
     * @dev Get current risk parameters
     * @return RiskParameters struct containing all current parameters
     */
    function getRiskParameters() public view returns (RiskParameters memory) {
        return riskParameters;
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