# Screeps-Lucy
## Implements
- Automatic Plan
    - Unit-based, which allows for flexibility.
    - Run at every tick for some cases, while employing caching to speed up.
- Task System
    - Allow for Function or in-built `Task Module` to create high-performance, clear and easy-to-program `run` function.
    - Event-Trigger, which is used to avoid attempt of issuing all possible tasks at every tick.
- Money System
    - Provide standards to evaluate `Task` and, thus, choose the most profitable one.
- Global Manager
    - Spawn of Creep, implementing `GroupPatch Constraint`.
    - Task, implementing `GroupPatch Constraint`.
    - Resource, comprised of `retrieve` and `store`, implementing `Resource Reserve`.
- Structure Memory
    - Periodical or Computation-oriented Recycle.
- *Flag Trigger* (Under Development ⛏️)