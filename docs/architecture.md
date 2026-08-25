# Architecture

Setpoint is a state machine around replaceable agent sessions and observation adapters.

## State machine

```text
DEFINING
   ↓
CODING ←───────────────────────────────┐
   ↓                                   │
OBSERVING                              │
   ↓                                   │
JUDGING ── CONTINUE ───────────────────┘
   │
   └── FINAL_CANDIDATE
             ↓
            JURY
          ↙      ↘
       FAIL      PASS
        │          │
        └→ CODING  DONE
```

The Setpoint run is the durable identity. Agent sessions are resources attached to roles inside that run.

## Session topology

### North Star Definer

Runs once in a fresh standalone session. It can be bound to the strongest available agent/model because its output influences every later iteration. It describes the desired finished reality and may give implementation leverage, but it must not become a software specification.

### Coder

One persistent ACP session for the run. It owns implementation choices and receives the frozen North Star plus the latest directional feedback.

### Observer

Turns the current product into judgeable evidence. Current built-ins are browser screenshots and command behavior. The observer does not decide quality.

### Progress Judge

A fresh standalone session is created every time the worker stops. It is code-blind and can only return `CONTINUE` or `FINAL_CANDIDATE`. The session is destroyed after the judgment so it cannot become attached to prior attempts.

### Final Jury

Each juror gets a separate fresh standalone session with no worker claims, previous judge opinions, or implementation history. The default policy requires every juror to pass.

## Runtime boundary

ACP is the preferred session protocol. The same authenticated ACP agent can back every role by default:

```text
main ACP runtime
├── coder session       persistent
├── definer session     fresh once
├── judge session       fresh per stop
└── jury sessions       fresh per candidate
```

Reasoning profiles may override the ACP command/arguments for a role, allowing a stronger or different standalone agent without changing the state machine.

An API-backed `StructuredModel` remains an optional adapter. It is not required by the core architecture.

## Extension interfaces

The engine depends on three small contracts: `CodingAgent`, `Observer`, and `StructuredModel`. The default `StructuredModel` implementation is itself backed by fresh ACP agent sessions. OpenAI and future direct API providers are optional alternatives.

A future PTY runtime can support terminal agents without ACP while preserving the same role/session lifecycle.

## Frozen target

`north-star.json` is generated once per run and is never rewritten. Later judges always receive that same object. This prevents evaluator drift toward whatever the coder happened to produce.

## Prompt composition

User prompt preferences are appended after Setpoint's role invariants. Setpoint intentionally does not expose a raw replacement for the entire system prompt in v0.1 because that would make run semantics unknowable.
