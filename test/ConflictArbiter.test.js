const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Gas Measurement Tests for ConflictArbiter
 * Validates computational overhead claims from the paper
 */

describe("ConflictArbiter - Gas Measurement", function () {
    let arbiter;
    let signers;
    const AGENT_COUNT = 7;
    const INITIAL_REPUTATION = 1000;

    before(async function () {
        signers = await ethers.getSigners();
        const ConflictArbiter = await ethers.getContractFactory("ConflictArbiter");
        arbiter = await ConflictArbiter.deploy(0);
        await arbiter.waitForDeployment();
        console.log("\n  Contract deployed at:", await arbiter.getAddress());
    });

    describe("Individual Operation Gas Costs", function () {
        it("Measure agent registration gas", async function () {
            const gasCosts = [];
            for (let i = 0; i < AGENT_COUNT; i++) {
                const tx = await arbiter.registerAgent(
                    signers[i + 1].address,
                    `agent_${i}`,
                    INITIAL_REPUTATION
                );
                const receipt = await tx.wait();
                gasCosts.push(Number(receipt.gasUsed));
            }
            const avgGas = gasCosts.reduce((a, b) => a + b, 0) / gasCosts.length;
            console.log(`\n    Registration: ${avgGas.toFixed(0)} gas (avg of ${AGENT_COUNT})`);
            console.log(`    Individual: ${gasCosts.join(", ")}`);
        });

        it("Measure proposal submission gas", async function () {
            const proposer = arbiter.connect(signers[1]);
            // submitProposal(config, prediction)
            const tx = await proposer.submitProposal("resource_0:param_config", 10);
            const receipt = await tx.wait();
            console.log(`\n    Proposal submission: ${receipt.gasUsed} gas`);
        });

        it("Measure prediction submission gas", async function () {
            const gasCosts = [];
            // submitPrediction(proposalId, support/oppose)
            for (let i = 1; i < AGENT_COUNT; i++) {
                const predictor = arbiter.connect(signers[i + 1]);
                const support = i % 2 === 0; // alternate support/oppose
                const tx = await predictor.submitPrediction(0, support);
                const receipt = await tx.wait();
                gasCosts.push(Number(receipt.gasUsed));
            }
            const avgGas = gasCosts.reduce((a, b) => a + b, 0) / gasCosts.length;
            console.log(`\n    Prediction: ${avgGas.toFixed(0)} gas (avg of ${AGENT_COUNT - 1})`);
        });

        it("Measure decision evaluation gas", async function () {
            // evaluateDecision(proposalId)
            const tx = await arbiter.evaluateDecision(0);
            const receipt = await tx.wait();
            console.log(`\n    Decision evaluation: ${receipt.gasUsed} gas`);
        });

        it("Measure outcome recording gas", async function () {
            // recordOutcome(proposalId, outcomeHash)
            const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome_data"));
            const tx = await arbiter.recordOutcome(0, outcomeHash);
            const receipt = await tx.wait();
            console.log(`\n    Outcome recording: ${receipt.gasUsed} gas`);
        });

        it("Measure reputation update gas", async function () {
            const tx = await arbiter.updateReputation(signers[1].address, 5);
            const receipt = await tx.wait();
            console.log(`\n    Reputation update: ${receipt.gasUsed} gas`);
        });
    });
});

describe("Decision Cycle Gas Scaling", function () {
    let signers;

    before(async function () {
        signers = await ethers.getSigners();
    });

    for (const numAgents of [3, 4, 5, 6, 7]) {
        it(`Complete decision cycle with ${numAgents} agents`, async function () {
            const ConflictArbiter = await ethers.getContractFactory("ConflictArbiter");
            const arbiter = await ConflictArbiter.deploy(0);
            await arbiter.waitForDeployment();

            // Register agents
            let registrationGas = 0n;
            for (let i = 0; i < numAgents; i++) {
                const tx = await arbiter.registerAgent(signers[i + 1].address, `agent_${i}`, 1000);
                const receipt = await tx.wait();
                registrationGas += receipt.gasUsed;
            }

            // Phase 1: submitProposal(config, prediction)
            const proposer = arbiter.connect(signers[1]);
            let tx = await proposer.submitProposal("resource_0:config", 10);
            let receipt = await tx.wait();
            const proposalGas = receipt.gasUsed;

            // Phase 2: submitPrediction(support/oppose) - all agents except proposer
            let predictionGas = 0n;
            for (let i = 1; i < numAgents; i++) {
                const predictor = arbiter.connect(signers[i + 1]);
                const support = i % 2 === 0;
                tx = await predictor.submitPrediction(0, support);
                receipt = await tx.wait();
                predictionGas += receipt.gasUsed;
            }

            // Phase 3: evaluateDecision(proposalId)
            tx = await arbiter.evaluateDecision(0);
            receipt = await tx.wait();
            const decisionGas = receipt.gasUsed;

            // Phase 4: recordOutcome(outcomeHash)
            const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome"));
            tx = await arbiter.recordOutcome(0, outcomeHash);
            receipt = await tx.wait();
            const outcomeGas = receipt.gasUsed;

            // Reputation updates
            let repGas = 0n;
            for (let i = 0; i < numAgents; i++) {
                tx = await arbiter.updateReputation(signers[i + 1].address, 5 - i);
                receipt = await tx.wait();
                repGas += receipt.gasUsed;
            }

            const cycleTotal = proposalGas + predictionGas + decisionGas + outcomeGas + repGas;

            console.log(`\n    === ${numAgents} Agents ===`);
            console.log(`    Registration (one-time): ${registrationGas}`);
            console.log(`    Proposal:     ${proposalGas}`);
            console.log(`    Predictions:  ${predictionGas} (${predictionGas / BigInt(numAgents - 1)} avg)`);
            console.log(`    Decision:     ${decisionGas}`);
            console.log(`    Outcome:      ${outcomeGas}`);
            console.log(`    Rep updates:  ${repGas}`);
            console.log(`    CYCLE TOTAL:  ${cycleTotal}`);
        });
    }
});

describe("Workflow Enforcement Tests (Table V)", function () {
    let arbiter;
    let signers;

    beforeEach(async function () {
        signers = await ethers.getSigners();
        const ConflictArbiter = await ethers.getContractFactory("ConflictArbiter");
        arbiter = await ConflictArbiter.deploy(0);
        await arbiter.waitForDeployment();

        for (let i = 0; i < 3; i++) {
            await arbiter.registerAgent(signers[i + 1].address, `agent_${i}`, 1000);
        }
    });

    it("Rejects unregistered agent proposal (NotRegistered)", async function () {
        const unregistered = arbiter.connect(signers[10]);
        await expect(
            unregistered.submitProposal("config", 10)
        ).to.be.revertedWith("NotRegistered");
    });

    it("Rejects duplicate prediction (AlreadySubmitted)", async function () {
        const proposer = arbiter.connect(signers[1]);
        await proposer.submitProposal("config", 10);

        const predictor = arbiter.connect(signers[2]);
        await predictor.submitPrediction(0, true);

        await expect(
            predictor.submitPrediction(0, false)
        ).to.be.revertedWith("AlreadySubmitted");
    });

    it("Rejects late prediction after decision (WindowClosed)", async function () {
        const proposer = arbiter.connect(signers[1]);
        await proposer.submitProposal("config", 10);

        const predictor = arbiter.connect(signers[2]);
        await predictor.submitPrediction(0, true);

        await arbiter.evaluateDecision(0);

        const latePredictor = arbiter.connect(signers[3]);
        await expect(
            latePredictor.submitPrediction(0, true)
        ).to.be.revertedWith("WindowClosed");
    });

    it("Rejects decision before quorum (InsufficientPredictions)", async function () {
        const proposer = arbiter.connect(signers[1]);
        await proposer.submitProposal("config", 10);

        await expect(
            arbiter.evaluateDecision(0)
        ).to.be.revertedWith("InsufficientPredictions");
    });

    it("Rejects outcome before decision (DecisionPending)", async function () {
        const proposer = arbiter.connect(signers[1]);
        await proposer.submitProposal("config", 10);

        const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes("outcome"));
        await expect(
            arbiter.recordOutcome(0, outcomeHash)
        ).to.be.revertedWith("DecisionPending");
    });
});

describe("Window Throughput Simulation", function () {
    let arbiter;
    let signers;

    before(async function () {
        signers = await ethers.getSigners();
        const ConflictArbiter = await ethers.getContractFactory("ConflictArbiter");
        arbiter = await ConflictArbiter.deploy(0);
        await arbiter.waitForDeployment();

        for (let i = 0; i < 7; i++) {
            await arbiter.registerAgent(signers[i + 1].address, `agent_${i}`, 1000);
        }
    });

    it("Simulate 75 proposals with 7 agents (realistic window)", async function () {
        this.timeout(180000);
        const NUM_PROPOSALS = 75;
        const NUM_AGENTS = 7;

        console.log(`\n    Simulating ${NUM_PROPOSALS} proposals with ${NUM_AGENTS} agents...`);

        let totalGas = 0n;

        // Submit all proposals
        let proposalGas = 0n;
        for (let p = 0; p < NUM_PROPOSALS; p++) {
            const proposer = arbiter.connect(signers[(p % NUM_AGENTS) + 1]);
            const tx = await proposer.submitProposal(`resource_${p % 19}:config`, p % 10);
            const receipt = await tx.wait();
            proposalGas += receipt.gasUsed;
        }
        totalGas += proposalGas;
        console.log(`    Proposals (${NUM_PROPOSALS}): ${proposalGas} gas`);

        // Submit predictions
        let predictionGas = 0n;
        let predictionCount = 0;
        for (let p = 0; p < NUM_PROPOSALS; p++) {
            const proposerIdx = p % NUM_AGENTS;
            for (let a = 0; a < NUM_AGENTS; a++) {
                if (a !== proposerIdx) {
                    const predictor = arbiter.connect(signers[a + 1]);
                    const support = (a + p) % 2 === 0;
                    const tx = await predictor.submitPrediction(p, support);
                    const receipt = await tx.wait();
                    predictionGas += receipt.gasUsed;
                    predictionCount++;
                }
            }
        }
        totalGas += predictionGas;
        console.log(`    Predictions (${predictionCount}): ${predictionGas} gas`);

        // Evaluate all decisions
        let decisionGas = 0n;
        for (let p = 0; p < NUM_PROPOSALS; p++) {
            const tx = await arbiter.evaluateDecision(p);
            const receipt = await tx.wait();
            decisionGas += receipt.gasUsed;
        }
        totalGas += decisionGas;
        console.log(`    Decisions (${NUM_PROPOSALS}): ${decisionGas} gas`);

        // Record outcomes
        let outcomeGas = 0n;
        for (let p = 0; p < NUM_PROPOSALS; p++) {
            const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(`outcome_${p}`));
            const tx = await arbiter.recordOutcome(p, outcomeHash);
            const receipt = await tx.wait();
            outcomeGas += receipt.gasUsed;
        }
        totalGas += outcomeGas;
        console.log(`    Outcomes (${NUM_PROPOSALS}): ${outcomeGas} gas`);

        console.log(`\n    === WINDOW TOTAL: ${totalGas} gas ===`);
        console.log(`    Per-proposal avg: ${Number(totalGas) / NUM_PROPOSALS} gas`);
        console.log(`    Blocks needed (30M limit): ${(Number(totalGas) / 30000000).toFixed(2)}`);
        console.log(`    Max proposals per window (30 blocks @ 30M): ${Math.floor(30 * 30000000 / (Number(totalGas) / NUM_PROPOSALS))}`);
    });
});
