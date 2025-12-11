# Trustless Multi-Agent Arbitration

Smart contract enforcement layer for trustless multi-agent arbitration.

## Overview

This repository contains the `ConflictArbiter` smart contract (~100 lines Solidity) implementing a four-phase arbitration workflow:

1. **Proposal Submission** — Agent submits configuration proposal with predicted impact
2. **Prediction Collection** — Other agents vote support or oppose
3. **Decision Evaluation** — Majority-based selection determines outcome
4. **Outcome Recording** — Actual outcomes recorded for audit trail

## Quick Start

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Contract Interface

```solidity
// Phase 1: Proposal Submission
function submitProposal(string config, int256 prediction) returns (uint256)

// Phase 2: Prediction Collection  
function submitPrediction(uint256 proposalId, bool support)

// Phase 3: Decision Evaluation
function evaluateDecision(uint256 proposalId) returns (bool)

// Phase 4: Outcome Recording
function recordOutcome(uint256 proposalId, bytes32 outcomeHash)
```

## Workflow Enforcement

The contract enforces workflow correctness with the following revert reasons:

| Invalid Operation | Revert Reason |
|-------------------|---------------|
| Unregistered agent proposal | `NotRegistered` |
| Late prediction (after decision) | `WindowClosed` |
| Duplicate prediction | `AlreadySubmitted` |
| Decision before predictions | `InsufficientPredictions` |
| Outcome before decision | `DecisionPending` |

## Gas Costs

| Operation | Gas |
|-----------|-----|
| Agent registration | ~99,600 |
| Proposal submission | ~150,700 |
| Prediction submission | ~104,600 |
| Decision evaluation | ~80,400–90,900 |
| Outcome recording | ~50,100 |

## License

MIT

## Citation

```bibtex
@misc{armstrong2025trustless,
  title={Smart Contract Enforcement for Trustless Multi-Agent Arbitration},
  author={Armstrong, Joss},
  year={2025}
}
```
