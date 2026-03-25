# `createAgent` tool loop breaks with gpt-5.4 via Braintrust gateway

## Bug

`createAgent` from `langchain` (JS) terminates after the first tool call round-trip when using `gpt-5.4` through the Braintrust gateway. The agent returns only 3 messages (`HumanMessage → AIMessage → ToolMessage`) and never calls the model again.

The issue is caused by the Braintrust gateway returning a static `id` (e.g. `chatcmpl-transformed`) on every completion. LangGraph's messages reducer uses `id` for deduplication — when the second model response has the same `id` as the first, it **replaces** the first AIMessage instead of being appended, breaking the agent loop.

## Reproduction

```bash
npm install
```

`repro-matrix.js` tests all combinations of model × gateway:

```bash
OPENAI_API_KEY=sk-... \
BRAINTRUST_API_KEY=... \
BRAINTRUST_PROJECT_ID=... \
node repro-matrix.js
```

Or test a specific combination:

```bash
node repro-matrix.js gpt-5.4 braintrust   # ❌ FAIL
node repro-matrix.js gpt-5.4 direct       # ✅ PASS
node repro-matrix.js gpt-4o-mini braintrust # ✅ PASS
node repro-matrix.js gpt-4o-mini direct    # ✅ PASS
```

### Expected

All combinations pass — the agent makes 2 sequential `add` tool calls and produces a final text response (6 messages).

### Actual

`gpt-5.4 + braintrust` fails — the agent stops after the first tool call (3 messages). All other combinations work.

## Root cause

The Braintrust gateway returns a non-unique `id` field on chat completions for `gpt-5.4` (e.g. `chatcmpl-transformed`). LangGraph's `messagesStateReducer` uses this `id` to deduplicate messages: when a new message shares an `id` with an existing one, it replaces it instead of appending. This causes the second model response to overwrite the first, corrupting the agent's message history and terminating the loop.

## Environment

- `langchain`: 1.2.36
- `@langchain/core`: 1.1.35
- `@langchain/openai`: 1.3.0
- Node.js: 22.x

## Related

- Python equivalent (different root cause, same symptom): [langchain-ai/langchain#33696](https://github.com/langchain-ai/langchain/issues/33696)
- `createAgent` strict tool binding: [langchain-ai/langchainjs#9496](https://github.com/langchain-ai/langchainjs/issues/9496)
