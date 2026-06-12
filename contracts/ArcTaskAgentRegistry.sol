// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcTaskAgentRegistry {
    struct Agent {
        address owner;
        string metadataURI;
        uint256 createdAt;
        bool active;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => Agent) public agents;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string metadataURI);
    event AgentMetadataUpdated(uint256 indexed agentId, string metadataURI);

    function registerAgent(address owner, string calldata metadataURI) external returns (uint256 agentId) {
        require(owner != address(0), "owner required");
        require(bytes(metadataURI).length != 0, "metadata required");

        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: owner,
            metadataURI: metadataURI,
            createdAt: block.timestamp,
            active: true
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
}
