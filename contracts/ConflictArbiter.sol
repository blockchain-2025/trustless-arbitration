// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ConflictArbiter
 * @notice Blockchain enforcement layer for trustless multi-agent arbitration
 * @dev Implements the four-phase workflow: Proposal, Prediction Collection, Decision, Outcome Recording
 */
contract ConflictArbiter {
    address public owner;
    uint256 public proposalCount;
    uint256 public decisionWindow;

    struct Agent {
        bool registered;
        uint256 reputation;
        string identifier;
    }

    struct Proposal {
        address proposer;
        string config;
        int256 proposerPrediction;
        uint256 createdAt;
        bool decided;
        bool approved;
        uint256 supportCount;
        uint256 opposeCount;
        bytes32 outcomeHash;
    }

    mapping(address => Agent) public agents;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public predictions; // true = support, false = oppose
    mapping(uint256 => mapping(address => bool)) public hasPredicted;
    mapping(uint256 => address[]) internal proposalPredictors;
    address[] public registeredAgents;

    event AgentRegistered(address indexed agent, string identifier, uint256 initialReputation);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string config);
    event PredictionSubmitted(uint256 indexed proposalId, address indexed agent, bool support);
    event DecisionExecuted(uint256 indexed proposalId, bool approved, uint256 supportCount, uint256 opposeCount);
    event OutcomeRecorded(uint256 indexed proposalId, bytes32 outcomeHash);
    event ReputationUpdated(address indexed agent, uint256 newReputation);

    constructor(uint256 _decisionWindow) {
        owner = msg.sender;
        decisionWindow = _decisionWindow;
    }

    function registerAgent(address _agent, string calldata _identifier, uint256 _initialReputation) external {
        require(!agents[_agent].registered, "Already registered");
        agents[_agent] = Agent({registered: true, reputation: _initialReputation, identifier: _identifier});
        registeredAgents.push(_agent);
        emit AgentRegistered(_agent, _identifier, _initialReputation);
    }

    /// @notice Phase 1: Proposal Submission - submitProposal(config, prediction)
    function submitProposal(
        string calldata _config,
        int256 _prediction
    ) external returns (uint256) {
        require(agents[msg.sender].registered, "NotRegistered");
        uint256 proposalId = proposalCount++;
        proposals[proposalId] = Proposal({
            proposer: msg.sender,
            config: _config,
            proposerPrediction: _prediction,
            createdAt: block.timestamp,
            decided: false,
            approved: false,
            supportCount: 0,
            opposeCount: 0,
            outcomeHash: bytes32(0)
        });
        emit ProposalCreated(proposalId, msg.sender, _config);
        return proposalId;
    }

    /// @notice Phase 2: Prediction Collection - submitPrediction(support/oppose)
    function submitPrediction(uint256 _proposalId, bool _support) external {
        require(agents[msg.sender].registered, "NotRegistered");
        require(_proposalId < proposalCount, "Invalid proposal");
        require(!proposals[_proposalId].decided, "WindowClosed");
        require(!hasPredicted[_proposalId][msg.sender], "AlreadySubmitted");

        predictions[_proposalId][msg.sender] = _support;
        hasPredicted[_proposalId][msg.sender] = true;
        proposalPredictors[_proposalId].push(msg.sender);
        
        if (_support) {
            proposals[_proposalId].supportCount++;
        } else {
            proposals[_proposalId].opposeCount++;
        }
        
        emit PredictionSubmitted(_proposalId, msg.sender, _support);
    }

    /// @notice Phase 3: Decision Evaluation - evaluateDecision(proposalId)
    function evaluateDecision(uint256 _proposalId) external returns (bool) {
        require(_proposalId < proposalCount, "Invalid proposal");
        Proposal storage proposal = proposals[_proposalId];
        require(!proposal.decided, "Already decided");
        require(proposalPredictors[_proposalId].length > 0, "InsufficientPredictions");

        // Majority-based selection
        bool approved = proposal.supportCount > proposal.opposeCount;

        proposal.decided = true;
        proposal.approved = approved;

        emit DecisionExecuted(_proposalId, approved, proposal.supportCount, proposal.opposeCount);
        return approved;
    }

    /// @notice Phase 4: Outcome Recording - recordOutcome(outcomeHash)
    function recordOutcome(uint256 _proposalId, bytes32 _outcomeHash) external {
        require(_proposalId < proposalCount, "Invalid proposal");
        require(proposals[_proposalId].decided, "DecisionPending");
        require(proposals[_proposalId].outcomeHash == bytes32(0), "Already recorded");
        proposals[_proposalId].outcomeHash = _outcomeHash;
        emit OutcomeRecorded(_proposalId, _outcomeHash);
    }

    function updateReputation(address _agent, int256 _adjustment) external {
        require(agents[_agent].registered, "NotRegistered");
        uint256 current = agents[_agent].reputation;
        if (_adjustment >= 0) {
            agents[_agent].reputation = current + uint256(_adjustment);
        } else {
            uint256 decrease = uint256(-_adjustment);
            agents[_agent].reputation = decrease >= current ? 100 : current - decrease;
        }
        emit ReputationUpdated(_agent, agents[_agent].reputation);
    }

    function getRegisteredAgentCount() external view returns (uint256) {
        return registeredAgents.length;
    }

    function getPredictorCount(uint256 _proposalId) external view returns (uint256) {
        return proposalPredictors[_proposalId].length;
    }
}
