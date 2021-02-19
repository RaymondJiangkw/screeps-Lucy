# Screeps-Lucy
## Implementations
- Automatic Plan
    - Unit-based, which allows for flexibility.
    - Run at every tick for some cases, while employing caching to speed up.
    - Use minCut written by @saruss to construct ramparts to protect important units.
- Automatic Claim
    - Triggered whenever `GCL` is upgraded.
    - Filter out rooms unfit for the `Automatic Plan` pattern.
    - Filter out rooms the path to which inevitably contain hostile rooms.
- *Automatic Remote Mining (Source and Mineral)* (Under Development ⛏️)
- Automatic Market
    - Buying and Sending based on demand.
    - Selling is triggered automatically and based on demand of credits and relies on settings.
- Automatic Lab
    - Choose the produced resource based on some principles and possessed resources.
    - Trigger `buying`, if some ingredients are needed automatically.
- Task System
    - Allow for Function or in-built `Task Module` to create high-performance, clear and easy-to-program `run` function.
    - Event-Trigger, which is used to avoid attempt of issuing all possible tasks at every tick.
- Money System
    - Provide standards to evaluate `Task` and, thus, choose the most profitable one.
- Global Manager
    - Spawn of Creep, implementing `GroupPatch Constraint`.
    - Task, implementing `GroupPatch Constraint`.
    - Resource, comprised of `retrieve` and `store`, implementing `Resource Reserve`.
    - Link, implementing `Source Destination Mechanisms` and `Trigger-Driven Response`.
- *Structure Memory* (removed)
    - Periodical or Computation-oriented Recycle.
- Fast Energy-Filling
    - Imitate the layout of @tigga.

    <div style="text-align:center;"><img src="./demo/fast-energy-filling.PNG" alt="Fast Energy Filling Layout" /></div>
- Central Transfer Unit
    - Enable flexible and fast transferring of Resources
- Dynamic BodyParts
    - Determined based on demand
- Visualizer & Notifier
    - Adapted from `Overmind` written by @bencbartlett.
    - Extend with monitoring any `variable`.

    <div style="text-align:center;"><img src="./demo/notifier.PNG" alt="Notifier" /></div>