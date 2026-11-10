# The prompt

This whole project was built by Claude Fable 5.2, working alone, from one prompt.

The model was started in an empty folder containing `SPEC.md` and `MODEL.txt`, with this message:

> Read SPEC.md in this folder completely, then build exactly what it describes. No human is available to answer questions or help. Keep working end to end until every acceptance test in the spec passes.

`SPEC.md` is the full brief, about 5,000 words. Nobody answered questions or edited code during the run.

- Run time: about 11 hours, unattended
- Cost: about $162 in API-equivalent usage
- Result: every acceptance test in `SPEC.md` passing, by the model's own test suite (see `FINAL.md` and `tests/`)

One follow-up message was sent after the run, asking for background music on by default. Nothing else was changed by hand.

Live site: https://earth-whole-story.pages.dev
