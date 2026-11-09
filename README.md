# Simulator Consistency Annotation

Static site for the reviewer question "are the latent evaluations related to the user
turns the simulator generates?". Annotators see 50 SimulatorArena conversations up to an
assistant turn, the Gemma3-4B LES simulator's internal evaluation of that turn, and the
user message the simulator then wrote, and label:

**Is the message consistent with the internal evaluation?** Yes / Partially / No (+ optional comment)

Sample (scripts/consistency_sample.py, seed 0): stratified over (planned reaction, rating):
Critique r1-4 (17), Neutral r1-5 (17), Praise r4-5 (16); one item per conversation.

Publishing, storage (optional Apps Script backend in `apps_script.gs`, URL in `config.js`)
and export work exactly as in the first annotation site (`../annotation/README.md`).

```bash
git remote add origin https://github.com/tareknaous/les-consistency.git
git push -u origin main
```
Then Settings → Pages → Deploy from branch `main`, `/ (root)`.
