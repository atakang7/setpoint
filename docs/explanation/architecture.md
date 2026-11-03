# Architecture

`SetpointEngine` owns run transitions. The coder, observer, and evaluator implementations are selected in `createRuntime`.

## Session boundaries

The North Star is defined once. One ACP coder session persists across iterations, while the progress judge and each final juror use fresh evaluator sessions.

The persistent worker retains implementation context. Fresh jurors receive the current observation and frozen target without previous verdicts. These isolated sessions require additional agent starts.

## Evidence boundary

The browser observer records screenshots, page text, and browser errors. The command observer records exit status, stdout, and stderr.

The progress judge returns `CONTINUE` or `FINAL_CANDIDATE`. A final candidate reaches the jury; a failed jury sends criticism back to the same coder.

## Storage boundary

`RunStorage` writes the frozen target and iteration artifacts. The inspector and HTTP dashboard reconstruct state from these files and cannot advance the engine.

## Adapter boundary

`CodingAgent`, `Observer`, and `StructuredModel` are the engine contracts. ACP backs the default worker and evaluator sessions; the OpenAI structured model is optional.
