// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcTaskAgentRegistry {
    struct Agent {
        address owner;
        string metadataURI;
        uint256 createdAt;
        bool active;
        uint32 reputation;
        uint64 completedJobs;
        uint64 rejectedJobs;
        uint256 totalEarned;
    }

    address public admin;
    uint256 public nextAgentId = 1;
    mapping(uint256 => Agent) public agents;
    mapping(address => bool) public authorizedEscrows;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string metadataURI);
    event AgentMetadataUpdated(uint256 indexed agentId, string metadataURI);
    event EscrowAuthorizationUpdated(address indexed escrow, bool authorized);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event AgentReputationUpdated(
        uint256 indexed agentId,
        bool accepted,
        uint32 reputation,
        uint64 completedJobs,
        uint64 rejectedJobs,
        uint256 totalEarned
    );

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyAuthorizedEscrow() {
        require(authorizedEscrows[msg.sender], "not authorized escrow");
        _;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "admin required");
        address previousAdmin = admin;
        admin = newAdmin;
        emit AdminTransferred(previousAdmin, newAdmin);
    }

    function setEscrowAuthorization(address escrow, bool authorized) external onlyAdmin {
        require(escrow != address(0), "escrow required");
        authorizedEscrows[escrow] = authorized;
        emit EscrowAuthorizationUpdated(escrow, authorized);
    }

    function registerAgent(address owner, string calldata metadataURI) external returns (uint256 agentId) {
        require(owner != address(0), "owner required");
        require(msg.sender == owner, "owner must register");
        require(bytes(metadataURI).length != 0, "metadata required");

        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: owner,
            metadataURI: metadataURI,
            createdAt: block.timestamp,
            active: true,
            reputation: 50,
            completedJobs: 0,
            rejectedJobs: 0,
            totalEarned: 0
        });

        emit AgentRegistered(agentId, owner, metadataURI);
    }

    function updateMetadata(uint256 agentId, string calldata metadataURI) external {
        Agent storage agent = agents[agentId];
        require(agent.active, "agent missing");
        require(msg.sender == agent.owner, "not owner");
        require(bytes(metadataURI).length != 0, "metadata required");

        agent.metadataURI = metadataURI;
        emit AgentMetadataUpdated(agentId, metadataURI);
    }

    function getAgentOwner(uint256 agentId) external view returns (address) {
        Agent storage agent = agents[agentId];
        require(agent.active, "agent missing");
        return agent.owner;
    }

    function getAgentReputation(
        uint256 agentId
    )
        external
        view
        returns (uint32 reputation, uint64 completedJobs, uint64 rejectedJobs, uint256 totalEarned)
    {
        Agent storage agent = agents[agentId];
        require(agent.active, "agent missing");
        return (agent.reputation, agent.completedJobs, agent.rejectedJobs, agent.totalEarned);
    }

    function recordOutcome(
        uint256 agentId,
        bool accepted,
        uint256 rewardAmount
    ) external onlyAuthorizedEscrow {
        Agent storage agent = agents[agentId];
        require(agent.active, "agent missing");

        if (accepted) {
            agent.completedJobs += 1;
            agent.totalEarned += rewardAmount;
            agent.reputation = agent.reputation > 92 ? 100 : agent.reputation + 8;
        } else {
            agent.rejectedJobs += 1;
            agent.reputation = agent.reputation < 6 ? 0 : agent.reputation - 6;
        }

        emit AgentReputationUpdated(
            agentId,
            accepted,
            agent.reputation,
            agent.completedJobs,
            agent.rejectedJobs,
            agent.totalEarned
        );
    }
}
