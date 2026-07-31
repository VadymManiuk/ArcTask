// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArcTaskAgentRegistryV2 {
    function getAgentOwner(uint256 agentId) external view returns (address);

    function recordOutcome(uint256 agentId, bool accepted, uint256 rewardAmount) external;
}

contract ArcTaskEscrowV2 {
    uint256 public constant BPS = 10_000;
    uint256 public constant COMPUTE_FEE_BPS = 1_500;
    uint256 public constant CLIENT_BOND_BPS = 2_000;
    uint256 public constant PLATFORM_FEE_BPS = 300;
    uint256 public constant EVALUATOR_FEE_BPS = 200;
    uint256 public constant REVIEW_PERIOD = 48 hours;
    uint256 public constant DISPUTE_PERIOD = 7 days;
    uint8 public constant MAX_REVISIONS = 2;

    enum JobStatus {
        Funded,
        Submitted,
        Accepted,
        Rejected,
        Refunded,
        Disputed
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
        uint256 computeFeeAmount;
        uint256 clientBondAmount;
        uint256 platformFeeAmount;
        uint256 evaluatorFeeAmount;
        uint64 reviewDeadline;
        uint64 disputeDeadline;
        uint8 revisionCount;
        bool computeFeeCredited;
        bool evaluatorFeeCredited;
        string revisionReason;
        bytes32 disputeReasonHash;
        uint32 executionVersion;
        uint256 executionBudgetAmount;
        uint256 computeFeeCreditedAmount;
    }

    struct Economics {
        uint256 totalFunding;
        uint256 computeFeeAmount;
        uint256 clientBondAmount;
        uint256 platformFeeAmount;
        uint256 evaluatorFeeAmount;
    }

    IArcTaskAgentRegistryV2 public immutable registry;
    address public immutable treasury;
    address public immutable arbitrator;
    uint256 public nextJobId;
    mapping(uint256 => Job) private jobRecords;
    mapping(address => uint256) public claimable;
    bool private locked;

    event JobCreated(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed client,
        address evaluator,
        uint256 rewardAmount,
        uint64 deadline,
        string jobURI
    );
    event JobEconomics(
        uint256 indexed jobId,
        uint256 computeFeeAmount,
        uint256 clientBondAmount,
        uint256 platformFeeAmount,
        uint256 evaluatorFeeAmount,
        uint256 totalFunding
    );
    event DeliverableSubmitted(
        uint256 indexed jobId,
        bytes32 deliverableHash,
        uint64 reviewDeadline,
        uint8 revisionCount
    );
    event RevisionRequested(uint256 indexed jobId, uint8 revisionCount, string reason);
    event RetryFunded(
        uint256 indexed jobId,
        uint32 indexed executionVersion,
        uint256 rewardIncrease,
        uint256 executionBudgetAmount,
        uint64 deadline,
        string jobURI
    );
    event DisputeOpened(
        uint256 indexed jobId,
        address indexed evaluator,
        bytes32 reasonHash,
        uint64 disputeDeadline
    );
    event DisputeResolved(
        uint256 indexed jobId,
        uint16 providerAwardBps,
        bytes32 reasonHash,
        uint256 providerAward,
        uint256 clientRefund
    );
    event WorkAccepted(uint256 indexed jobId, address indexed agentOwner, uint256 rewardAmount);
    event WorkRejected(uint256 indexed jobId, address indexed client, uint256 clientRefund);
    event JobRefunded(uint256 indexed jobId, address indexed client, uint256 clientRefund);
    event CreditAdded(uint256 indexed jobId, address indexed recipient, uint256 amount, bytes32 reason);
    event Withdrawal(address indexed recipient, uint256 amount);

    error InvalidAddress();
    error InvalidFunding();
    error InvalidJob();
    error InvalidStatus();
    error Unauthorized();
    error DeadlinePassed();
    error ReviewActive();
    error DisputeActive();
    error InvalidReason();
    error InvalidAward();
    error RevisionLimitReached();
    error NothingToWithdraw();
    error NativeTransferFailed();
    error ReentrantCall();

    constructor(
        address registryAddress,
        address treasuryAddress,
        address arbitratorAddress,
        uint256 initialJobId
    ) {
        if (
            registryAddress == address(0) ||
            treasuryAddress == address(0) ||
            arbitratorAddress == address(0) ||
            initialJobId == 0
        ) {
            revert InvalidAddress();
        }

        registry = IArcTaskAgentRegistryV2(registryAddress);
        treasury = treasuryAddress;
        arbitrator = arbitratorAddress;
        nextJobId = initialJobId;
    }

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    function quoteFunding(
        uint256 rewardAmount
    )
        public
        pure
        returns (
            uint256 totalFunding,
            uint256 computeFeeAmount,
            uint256 clientBondAmount,
            uint256 platformFeeAmount,
            uint256 evaluatorFeeAmount
        )
    {
        Economics memory economics = _quoteFunding(rewardAmount);
        return (
            economics.totalFunding,
            economics.computeFeeAmount,
            economics.clientBondAmount,
            economics.platformFeeAmount,
            economics.evaluatorFeeAmount
        );
    }

    function createJob(
        uint256 agentId,
        uint256 rewardAmount,
        uint64 deadline,
        address evaluator,
        string calldata jobURI
    ) external payable returns (uint256 jobId) {
        if (deadline <= block.timestamp) revert DeadlinePassed();
        if (evaluator == address(0)) revert InvalidAddress();
        if (bytes(jobURI).length == 0) revert InvalidReason();

        Economics memory economics = _quoteFunding(rewardAmount);
        if (msg.value != economics.totalFunding) revert InvalidFunding();

        address agentOwner = registry.getAgentOwner(agentId);
        jobId = nextJobId++;
        Job storage job = jobRecords[jobId];
        job.client = msg.sender;
        job.agentId = agentId;
        job.agentOwner = agentOwner;
        job.evaluator = evaluator;
        job.rewardAmount = rewardAmount;
        job.deadline = deadline;
        job.jobURI = jobURI;
        job.status = JobStatus.Funded;
        job.createdAt = block.timestamp;
        job.updatedAt = block.timestamp;
        job.computeFeeAmount = economics.computeFeeAmount;
        job.clientBondAmount = economics.clientBondAmount;
        job.platformFeeAmount = economics.platformFeeAmount;
        job.evaluatorFeeAmount = economics.evaluatorFeeAmount;
        job.executionVersion = 1;
        job.executionBudgetAmount = rewardAmount;

        _credit(jobId, treasury, economics.platformFeeAmount, keccak256("PLATFORM_FEE"));

        emit JobCreated(jobId, agentId, msg.sender, evaluator, rewardAmount, deadline, jobURI);
        emit JobEconomics(
            jobId,
            economics.computeFeeAmount,
            economics.clientBondAmount,
            economics.platformFeeAmount,
            economics.evaluatorFeeAmount,
            economics.totalFunding
        );
    }

    function submitDeliverable(uint256 jobId, bytes32 deliverableHash) external {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded) revert InvalidStatus();
        if (msg.sender != job.agentOwner) revert Unauthorized();
        if (block.timestamp > job.deadline) revert DeadlinePassed();
        if (deliverableHash == bytes32(0)) revert InvalidReason();
        if (job.executionBudgetAmount == 0) revert InvalidFunding();

        job.deliverableHash = deliverableHash;
        job.status = JobStatus.Submitted;
        job.reviewDeadline = uint64(block.timestamp + REVIEW_PERIOD);
        job.updatedAt = block.timestamp;
        job.revisionReason = "";

        uint256 computeFeeCredit = job.computeFeeAmount - job.computeFeeCreditedAmount;
        if (computeFeeCredit > 0) {
            job.computeFeeCredited = true;
            job.computeFeeCreditedAmount = job.computeFeeAmount;
            _credit(jobId, job.agentOwner, computeFeeCredit, keccak256("COMPUTE_FEE"));
        }

        emit DeliverableSubmitted(jobId, deliverableHash, job.reviewDeadline, job.revisionCount);
    }

    function fundRetry(
        uint256 jobId,
        uint256 rewardIncrease,
        uint64 newDeadline,
        string calldata revisedJobURI
    ) external payable {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded) revert InvalidStatus();
        if (msg.sender != job.client) revert Unauthorized();
        if (newDeadline <= block.timestamp || newDeadline < job.deadline) revert DeadlinePassed();
        if (bytes(revisedJobURI).length == 0) revert InvalidReason();

        Economics memory economics = _quoteFunding(rewardIncrease);
        if (msg.value != economics.totalFunding) revert InvalidFunding();

        job.rewardAmount += rewardIncrease;
        job.deadline = newDeadline;
        job.jobURI = revisedJobURI;
        job.updatedAt = block.timestamp;
        job.computeFeeAmount += economics.computeFeeAmount;
        job.clientBondAmount += economics.clientBondAmount;
        job.platformFeeAmount += economics.platformFeeAmount;
        job.evaluatorFeeAmount += economics.evaluatorFeeAmount;
        job.executionVersion += 1;
        job.executionBudgetAmount = rewardIncrease;

        _credit(jobId, treasury, economics.platformFeeAmount, keccak256("PLATFORM_FEE"));

        emit RetryFunded(
            jobId,
            job.executionVersion,
            rewardIncrease,
            rewardIncrease,
            newDeadline,
            revisedJobURI
        );
        emit JobEconomics(
            jobId,
            job.computeFeeAmount,
            job.clientBondAmount,
            job.platformFeeAmount,
            job.evaluatorFeeAmount,
            economics.totalFunding
        );
    }

    function requestRevision(uint256 jobId, string calldata reason) external {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert InvalidStatus();
        if (msg.sender != job.evaluator) revert Unauthorized();
        if (block.timestamp > job.reviewDeadline) revert ReviewActive();
        if (job.revisionCount >= MAX_REVISIONS) revert RevisionLimitReached();
        if (bytes(reason).length == 0) revert InvalidReason();

        job.revisionCount += 1;
        job.status = JobStatus.Funded;
        job.deliverableHash = bytes32(0);
        job.reviewDeadline = 0;
        job.updatedAt = block.timestamp;
        job.revisionReason = reason;
        job.executionBudgetAmount = 0;

        emit RevisionRequested(jobId, job.revisionCount, reason);
    }

    function acceptWork(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert InvalidStatus();
        if (msg.sender != job.evaluator) revert Unauthorized();

        _accept(jobId, job, keccak256("EVALUATOR_ACCEPT"));
    }

    function finalizeReview(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert InvalidStatus();
        if (block.timestamp <= job.reviewDeadline) revert ReviewActive();

        _accept(jobId, job, keccak256("AUTO_ACCEPT"));
    }

    function openDispute(uint256 jobId, bytes32 reasonHash) external {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert InvalidStatus();
        if (msg.sender != job.evaluator) revert Unauthorized();
        if (block.timestamp > job.reviewDeadline) revert ReviewActive();
        if (reasonHash == bytes32(0)) revert InvalidReason();

        job.status = JobStatus.Disputed;
        job.disputeReasonHash = reasonHash;
        job.disputeDeadline = uint64(block.timestamp + DISPUTE_PERIOD);
        job.updatedAt = block.timestamp;
        _creditEvaluatorFee(jobId, job);

        emit DisputeOpened(jobId, msg.sender, reasonHash, job.disputeDeadline);
    }

    function resolveDispute(
        uint256 jobId,
        uint16 providerAwardBps,
        bytes32 reasonHash
    ) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Disputed) revert InvalidStatus();
        if (msg.sender != arbitrator) revert Unauthorized();
        if (providerAwardBps > BPS) revert InvalidAward();
        if (reasonHash == bytes32(0)) revert InvalidReason();

        uint256 remainingReward = job.rewardAmount - job.computeFeeAmount;
        uint256 providerAward = (remainingReward * providerAwardBps) / BPS;
        uint256 clientRefund = remainingReward - providerAward;
        uint256 arbitrationFee = job.clientBondAmount / 4;
        bool providerWins = providerAwardBps >= BPS / 2;

        _credit(jobId, job.agentOwner, providerAward, keccak256("DISPUTE_PROVIDER_AWARD"));
        _credit(jobId, job.client, clientRefund, keccak256("DISPUTE_CLIENT_REFUND"));
        _credit(jobId, arbitrator, arbitrationFee, keccak256("ARBITRATION_FEE"));
        if (providerWins) {
            _credit(
                jobId,
                job.agentOwner,
                job.clientBondAmount - arbitrationFee,
                keccak256("CLIENT_BOND_PENALTY")
            );
            job.status = JobStatus.Accepted;
        } else {
            _credit(
                jobId,
                job.client,
                job.clientBondAmount - arbitrationFee,
                keccak256("CLIENT_BOND_RETURN")
            );
            job.status = JobStatus.Rejected;
        }

        job.updatedAt = block.timestamp;
        registry.recordOutcome(
            job.agentId,
            providerWins,
            job.computeFeeAmount + providerAward
        );

        emit DisputeResolved(jobId, providerAwardBps, reasonHash, providerAward, clientRefund);
        if (providerWins) {
            emit WorkAccepted(jobId, job.agentOwner, job.computeFeeAmount + providerAward);
        } else {
            emit WorkRejected(jobId, job.client, clientRefund);
        }
    }

    function finalizeStaleDispute(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Disputed) revert InvalidStatus();
        if (block.timestamp <= job.disputeDeadline) revert DisputeActive();

        uint256 remainingReward = job.rewardAmount - job.computeFeeAmount;
        uint256 providerAward = remainingReward / 2;
        uint256 clientRefund = remainingReward - providerAward;

        _credit(jobId, job.agentOwner, providerAward, keccak256("STALE_DISPUTE_PROVIDER"));
        _credit(jobId, job.client, clientRefund, keccak256("STALE_DISPUTE_CLIENT"));
        _credit(jobId, job.client, job.clientBondAmount, keccak256("CLIENT_BOND_RETURN"));
        job.status = JobStatus.Rejected;
        job.updatedAt = block.timestamp;

        emit DisputeResolved(jobId, uint16(BPS / 2), keccak256("STALE_DISPUTE"), providerAward, clientRefund);
        emit WorkRejected(jobId, job.client, clientRefund);
    }

    function refundExpired(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded) revert InvalidStatus();
        if (msg.sender != job.client) revert Unauthorized();
        if (block.timestamp <= job.deadline) revert DeadlinePassed();

        uint256 unearnedReward = job.computeFeeCredited
            ? job.rewardAmount - job.computeFeeAmount
            : job.rewardAmount;
        uint256 clientRefund = unearnedReward + job.clientBondAmount + job.evaluatorFeeAmount;

        job.status = JobStatus.Refunded;
        job.updatedAt = block.timestamp;
        _credit(jobId, job.client, clientRefund, keccak256("EXPIRED_REFUND"));

        emit JobRefunded(jobId, job.client, clientRefund);
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        claimable[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert NativeTransferFailed();

        emit Withdrawal(msg.sender, amount);
    }

    function jobs(
        uint256 jobId
    )
        external
        view
        returns (
            address client,
            uint256 agentId,
            address agentOwner,
            address evaluator,
            uint256 rewardAmount,
            uint64 deadline,
            string memory jobURI,
            bytes32 deliverableHash,
            JobStatus status,
            uint256 createdAt,
            uint256 updatedAt
        )
    {
        Job storage job = _job(jobId);
        return (
            job.client,
            job.agentId,
            job.agentOwner,
            job.evaluator,
            job.rewardAmount,
            job.deadline,
            job.jobURI,
            job.deliverableHash,
            job.status,
            job.createdAt,
            job.updatedAt
        );
    }

    function getJobEconomics(
        uint256 jobId
    )
        external
        view
        returns (
            uint256 computeFeeAmount,
            uint256 clientBondAmount,
            uint256 platformFeeAmount,
            uint256 evaluatorFeeAmount,
            bool computeFeeCredited,
            bool evaluatorFeeCredited
        )
    {
        Job storage job = _job(jobId);
        return (
            job.computeFeeAmount,
            job.clientBondAmount,
            job.platformFeeAmount,
            job.evaluatorFeeAmount,
            job.computeFeeCredited,
            job.evaluatorFeeCredited
        );
    }

    function getJobResolution(
        uint256 jobId
    )
        external
        view
        returns (
            uint64 reviewDeadline,
            uint64 disputeDeadline,
            uint8 revisionCount,
            string memory revisionReason,
            bytes32 disputeReasonHash
        )
    {
        Job storage job = _job(jobId);
        return (
            job.reviewDeadline,
            job.disputeDeadline,
            job.revisionCount,
            job.revisionReason,
            job.disputeReasonHash
        );
    }

    function getJobExecution(
        uint256 jobId
    )
        external
        view
        returns (
            uint32 executionVersion,
            uint256 executionBudgetAmount,
            uint256 computeFeeCreditedAmount
        )
    {
        Job storage job = _job(jobId);
        return (
            job.executionVersion,
            job.executionBudgetAmount,
            job.computeFeeCreditedAmount
        );
    }

    function _accept(uint256 jobId, Job storage job, bytes32 reason) private {
        uint256 remainingReward = job.rewardAmount - job.computeFeeAmount;
        job.status = JobStatus.Accepted;
        job.updatedAt = block.timestamp;
        _credit(jobId, job.agentOwner, remainingReward, reason);
        _credit(jobId, job.client, job.clientBondAmount, keccak256("CLIENT_BOND_RETURN"));
        _creditEvaluatorFee(jobId, job);
        registry.recordOutcome(job.agentId, true, job.rewardAmount);

        emit WorkAccepted(jobId, job.agentOwner, job.rewardAmount);
    }

    function _creditEvaluatorFee(uint256 jobId, Job storage job) private {
        if (job.evaluatorFeeCredited) return;
        job.evaluatorFeeCredited = true;
        _credit(jobId, job.evaluator, job.evaluatorFeeAmount, keccak256("EVALUATOR_FEE"));
    }

    function _credit(uint256 jobId, address recipient, uint256 amount, bytes32 reason) private {
        if (amount == 0) return;
        claimable[recipient] += amount;
        emit CreditAdded(jobId, recipient, amount, reason);
    }

    function _quoteFunding(uint256 rewardAmount) private pure returns (Economics memory economics) {
        if (rewardAmount == 0) revert InvalidFunding();

        economics.computeFeeAmount = (rewardAmount * COMPUTE_FEE_BPS) / BPS;
        economics.clientBondAmount = (rewardAmount * CLIENT_BOND_BPS) / BPS;
        economics.platformFeeAmount = (rewardAmount * PLATFORM_FEE_BPS) / BPS;
        economics.evaluatorFeeAmount = (rewardAmount * EVALUATOR_FEE_BPS) / BPS;
        economics.totalFunding =
            rewardAmount +
            economics.clientBondAmount +
            economics.platformFeeAmount +
            economics.evaluatorFeeAmount;
    }

    function _job(uint256 jobId) private view returns (Job storage job) {
        job = jobRecords[jobId];
        if (job.client == address(0)) revert InvalidJob();
    }
}
