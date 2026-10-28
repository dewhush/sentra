# 04 · Adding 2nd Agent

Frame `1059`. 1440×900.
Same shell as 03. The command bar is mid-compose for the second agent.

## What changes from 03

- Command field is filled, not empty. Example in the file: `@omp handle the backend refactor`.
- The submit button reads `SPAWN + SEND` when the line is `@name` plus a task. Plain argv or a bare preset stays `Spawn Agent ↵`.
- Sidebar still shows one live row until the daemon returns the new id. Then it shows two, and the grid becomes two columns (screen 05's layout, with one row).
- The first pane stays put. It does not remount.

## Grammar (one grammar, everywhere)

| Input | Result |
|---|---|
| `claude` or `@claude` | spawn preset claude |
| `bash --norc` | spawn raw argv |
| `@omp handle the backend refactor` | spawn omp, send the task, Enter |
| `@omp … @claude …` | one spawn per handle, each with its task |

Failure: inline error on the bar. Field keeps the text.

## Do not ship

- A different grammar in the hero, the sidebar chips, and this bar.
- `SPAWN + SEND` as a label when there is no task to send.
