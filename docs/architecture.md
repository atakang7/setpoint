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

The run state is Setpoint's source of continuity. A coding-agent session is a resource attached to the `CODING` phase, not the identity of the run.

## Role boundaries

### North Star Definer

Runs once. It may use the strongest model because its output influences every later iteration. It describes the desired finished reality and may give implementation leverage, but it must not become a software specification.

### Coder

Persistent ACP session. It owns implementation choices and receives the frozen North Star plus the latest directional feedback.

### Observer

Turns a product into judgeable evidence. Current built-ins are browser screenshots and command behavior. The observer does not decide quality.

### Progress Judge

Fresh model call at every worker stop. It is code-blind and can only return `CONTINUE` or `FINAL_CANDIDATE`.

### Final Jury

Fresh independent calls with no worker claims, previous judge opinions, or implementation context. The default policy requires every juror to pass.

## Extension interfaces

The engine depends on three small interfaces: `CodingAgent`, `Observer`, and `StructuredModel`. ACP, OpenAI, and Playwright are adapters around those contracts, not engine assumptions.

## Frozen target

`north-star.json` is generated once per run and is never rewritten. Later judges are always given that same object. This prevents evaluator drift toward whatever the coder happened to produce.

## Prompt composition

User prompt preferences are appended after Setpoint's role invariants. Setpoint intentionally does not expose a raw replacement for the entire system prompt in v0.1 because that would make run semantics unknowable.
