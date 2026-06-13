// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArcTaskAgentRegistry {
    function getAgentOwner(uint256 agentId) external view returns (address);
}

contract ArcTaskEscrow {
    enum JobStatus {
        Funded,
        Submitted,
        Accepted,
        Rejected,
        Refunded
    }

    struct Job {
        address client;
        uint256 agentId;
        address agentOwner;
        address evaluator;
        uint256 rewardAmount;
        uint64 deadline;
        string jobURI;
        bytes32 deliverableHash;
        JobStatus status;
        uint256 createdAt;
        uint256 updatedAt;
    }

    IArcTaskAgentRegistry public immutable registry;
    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed client,
        address evaluator,
        uint256 rewardAmount,
        uint64 deadline,
        string jobURI
    );
    event DeliverableSubmitted(uint256 indexed jobId, bytes32 deliverableHash);
    event WorkAccepted(uint256 indexed jobId, address indexed agentOwner, uint256 rewardAmount);
    event WorkRejected(uint256 indexed jobId, address indexed client, uint256 rewardAmount);
    event JobRefunded(uint256 indexed jobId, address indexed client, uint256 rewardAmount);

    constructor(address registryAddress) {
        require(registryAddress != address(0), "registry required");
        registry = IArcTaskAgentRegistry(registryAddress);
    }

    function createJob(
        uint256 agentId,
        uint256 rewardAmount,
        uint64 deadline,
        address evaluator,
        string calldata jobURI
    ) external payable returns (uint256 jobId) {
        require(rewardAmount > 0, "reward required");
        require(msg.value == rewardAmount, "native USDC mismatch");
        require(deadline > block.timestamp, "deadline in past");
        require(evaluator != address(0), "evaluator required");
        require(bytes(jobURI).length != 0, "job uri required");

        address agentOwner = registry.getAgentOwner(agentId);

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client: msg.sender,
            agentId: agentId,
            agentOwner: agentOwner,
            evaluator: evaluator,
            rewardAmount: rewardAmount,
            deadline: deadline,
            jobURI: jobURI,
            deliverableHash: bytes32(0),
            status: JobStatus.Funded,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit JobCreated(jobId, agentId, msg.sender, evaluator, rewardAmount, deadline, jobURI);
    }

    function submitDeliverable(uint256 jobId, bytes32 deliverableHash) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Funded, "not funded");
        require(msg.sender == job.agentOwner, "not agent owner");
        require(deliverableHash != bytes32(0), "hash required");

        job.deliverableHash = deliverableHash;
        job.status = JobStatus.Submitted;
        job.updatedAt = block.timestamp;

        emit DeliverableSubmitted(jobId, deliverableHash);
    }

    function acceptWork(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "not submitted");
        require(msg.sender == job.evaluator, "not evaluator");

        job.status = JobStatus.Accepted;
        job.updatedAt = block.timestamp;
        _sendNativeUsdc(job.agentOwner, job.rewardAmount);

        emit WorkAccepted(jobId, job.agentOwner, job.rewardAmount);
    }

    function rejectWork(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "not submitted");
        require(msg.sender == job.evaluator, "not evaluator");

        job.status = JobStatus.Rejected;
        job.updatedAt = block.timestamp;
        _sendNativeUsdc(job.client, job.rewardAmount);

        emit WorkRejected(jobId, job.client, job.rewardAmount);
    }

    function refundExpired(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Funded || job.status == JobStatus.Submitted, "not active");
        require(msg.sender == job.client, "not client");
        require(block.timestamp > job.deadline, "not expired");

        job.status = JobStatus.Refunded;
        job.updatedAt = block.timestamp;
        _sendNativeUsdc(job.client, job.rewardAmount);

        emit JobRefunded(jobId, job.client, job.rewardAmount);
    }

    function _sendNativeUsdc(address to, uint256 amount) private {
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "native transfer failed");
    }
}
