# ADR-001: Pre-Split UTXO Model for Batch Payments

**Status:** Accepted  
**Date:** 2026-05-16  
**Namespace:** tesseract  

## Context

Shared pool UTXO caused Custom error 186 (RpcError 1010) due to concurrent spend race conditions in Midnight ZSwap.

Bob and Carol cannot claim simultaneously from one pool coin because ZSwap destroys the entire UTXO on spend and creates a new change UTXO with a fresh Merkle index. If Carol's proof was built before Bob's transaction finalized, her proof references a destroyed coin — valid ZK proof, rejected by the node.

Three paths evaluated:
- **Path A** — Pre-Split UTXO: payer splits off-chain, each recipient gets own UTXO
- **Path B** — Contract Token (Map balances): account-model ERC-20 equivalent, high concurrency, but not native shielded NIGHT
- **Path C** — Sequential hack: frontend retries on error 186 with fresh mt_index — 45s UX penalty per front-run

## Decision

Implement **Path A: Pre-Split UTXO Model**.

Payer wallet creates individual UTXOs via multi-output transfer off-chain before calling submitBatch. Contract stores `Map<RecipientKey, ShieldedCoinInfo>`. Each recipient claims only their own independent UTXO. No shared mutable state during claim phase.

## Consequences

**Positive:**
- Eliminates error 186 race conditions entirely
- Enables fully concurrent claims (independent UTXOs)
- Better UX — no retry delays
- Simpler claim circuit (no change-coin management)

**Negative:**
- Increases UTXO count in payer wallet (one per recipient)
- Requires payer wallet multi-output transfer capability
- More complex `submitBatch` signature (Map input instead of single coin)
- Payer must pre-fund exact amounts per recipient

## Enforcement

Any circuit change that reintroduces a shared pool UTXO pattern (single `batchCoin` consumed by multiple recipients) MUST be rejected by `security-audit` agent.

The `midnight-circuit-dev` agent MUST query this ADR (via `architecture-decision` memory key) before modifying `TesseractCore.compact`.
