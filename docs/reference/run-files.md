# Run files

`run_dir` defaults to `.setpoint` in the current project.

| path | content |
| --- | --- |
| `.setpoint/latest` | Last run ID |
| `.setpoint/runs/<id>/run.json` | Phase, iteration, timestamps, final reason |
| `.setpoint/runs/<id>/north-star.json` | Frozen target |
| `.setpoint/runs/<id>/turns/NNN.json` | Coder output for one iteration |
| `.setpoint/runs/<id>/observations/NNN.json` | Evidence summary and artifact paths |
| `.setpoint/runs/<id>/judgments/NNN.json` | Progress judge verdict |
| `.setpoint/runs/<id>/jury/NNN.json` | Final juror verdicts for a candidate |
| `.setpoint/runs/<id>/observation-NNN/` | Screenshots and metadata, or command output |

Browser captures include `<width>x<height>.png` and `metadata.json`. Command captures include `command.txt`.
