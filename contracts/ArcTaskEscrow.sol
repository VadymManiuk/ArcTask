// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

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
        bytes32 deliverableHash;
        JobStatus status;
        uint256 createdAt;
        uint256 updatedAt;
    }

    IERC20Like public immutable usdc;
    IArcTaskAgentRegistry public immutable registry;
    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed client,
        address evaluator,
        uint256 rewardAmount,
        uint64 deadline
    );
    event DeliverableSubmitted(uint256 indexed jobId, bytes32 deliverableHash);
    event WorkAccepted(uint256 indexed jobId, address indexed agentOwner, uint256 rewardAmount);
    event WorkRejected(uint256 indexed jobId, address indexed client, uint256 rewardAmount);
    event JobRefunded(uint256 indexed jobId, address indexed client, uint256 rewardAmount);

    constructor(address registryAddress, address usdcAddress) {
        require(registryAddress != address(0), "registry required");
        require(usdcAddress != address(0), "usdc required");
        registry = IArcTaskAgentRegistry(registryAddress);
        usdc = IERC20Like(usdcAddress);
    }

    function createJob(
        uint256 agentId,
        uint256 rewardAmount,
        uint64 deadline,
        address evaluator
    ) external returns (uint256 jobId) {
        require(rewardAmount > 0, "reward required");
        require(deadline > block.timestamp, "deadline in past");
        require(evaluator != address(0), "evaluator required");

        address agentOwner = registry.getAgentOwner(agentId);
        require(_transferFrom(msg.sender, address(this), rewardAmount), "funding failed");

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client: msg.sender,
            agentId: agentId,
            agentOwner: agentOwner,
            evaluator: evaluator,
            rewardAmount: rewardAmount,
            deadline: deadline,
            deliverableHash: bytes32(0),
            status: JobStatus.Funded,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit JobCreated(jobId, agentId, msg.sender, evaluator, rewardAmount, deadline);
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
        require(_transfer(job.agentOwner, job.rewardAmount), "payout failed");

        emit WorkAccepted(jobId, job.agentOwner, job.rewardAmount);
    }

    function rejectWork(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "not submitted");
        require(msg.sender == job.evaluator, "not evaluator");

        job.status = JobStatus.Rejected;
        job.updatedAt = block.timestamp;
        require(_transfer(job.client, job.rewardAmount), "refund failed");

        emit WorkRejected(jobId, job.client, job.rewardAmount);
    }

    function refundExpired(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Funded || job.status == JobStatus.Submitted, "not active");
        require(msg.sender == job.client, "not client");
        require(block.timestamp > job.deadline, "not expired");

        job.status = JobStatus.Refunded;
        job.updatedAt = block.timestamp;
        require(_transfer(job.client, job.rewardAmount), "refund failed");

        emit JobRefunded(jobId, job.client, job.rewardAmount);
    }

    function _transfer(address to, uint256 amount) private returns (bool) {
        return usdc.transfer(to, amount);
    }

    function _transferFrom(address from, address to, uint256 amount) private returns (bool) {
        return usdc.transferFrom(from, to, amount);
    }
}
