# AI Pathfinding Plan

## 1. Goals and scope
- Provide a practical, modular pathfinding toolkit (grids, graphs, navmeshes)
- Support single-agent and multi-agent pathfinding (MAPF)
- Handle dynamic obstacles and real-time replanning
- Offer Python + TypeScript examples for notebooks and web demos

## 2. Core concepts
- Graph models: grid (4/8-connected), weighted graphs, navmesh, road networks
- Cost models: uniform vs. weighted edges, terrain costs, penalties
- Heuristics: admissible/consistent (Manhattan, Euclidean, Octile, Chebyshev)
- Optimality vs. speed: complete/optimal vs. anytime/approximate

## 3. Algorithms (single agent)
- Uninformed: BFS, Dijkstra
- Informed: Greedy Best-First Search, A*
- Optimal refinements: IDA*, Iterative Deepening A*
- Anytime: Anytime Repairing A* (ARA*), Anytime Dynamic A*
- Dynamic environments: Lifelong Planning A* (LPA*), D* Lite, D* Focused
- Continuous spaces: RRT, RRT*, PRM (for robotics/navmesh)

## 4. Heuristics and tie-breaking
- Heuristic selection per grid type: Manhattan (4-dir), Octile (8-dir), Euclidean (continuous)
- Consistency and admissibility trade-offs
- Tie-breaking strategies (favor smaller g, or larger g) and their effects on path smoothness

## 5. Path smoothing and post-processing
- Line-of-sight smoothing (Theta*, Lazy Theta*)
- String pulling on navmeshes (funnel algorithm)
- Curvature constraints (Dubins/Reeds–Shepp for vehicles)

## 6. Multi-agent pathfinding (MAPF)
- Centralized planning: Conflict-Based Search (CBS), ICTS, M* and variants
- Prioritized planning: fixed/rotating priorities, safe-interval path planning (SIPP)
- Local coordination: velocity obstacles (VO), ORCA
- Task allocation + routing: Hungarian, auction-based, MILP/CP formulations
- Deadlock/oscillation avoidance and reservation tables

## 7. Real-time and dynamic replanning
- Incremental search: LPA*, D* Lite for edge-cost/obstacle changes
- Safe-Interval Path Planning (SIPP) for time windows
- Receding horizon (MPC-style) replanning and time-bounded A*

## 8. Constraints and environments
- Kinematic constraints (max turn rate, acceleration)
- Anisotropic costs (slopes, moving walkways)
- Time-dependent costs (traffic, crowds)
- Risk-aware planning (chance constraints, CVaR-based costs)

## 9. Evaluation methodology
- Benchmarks: grid maps (DAI-Lab, MovingAI), navmesh maps
- Metrics: path length, expansions, runtime, suboptimality ε, success rate
- Stress tests: obstacle density, dynamic change frequency, agent count scaling

## 10. Engineering and APIs
- Data structures: open/closed lists, binary heap, pairing heap, Fibonacci heap
- Pluggable components: heuristic, neighbor generator, cost function, goal check
- Determinism vs. randomness (seeded RNG for reproducibility)
- Interfaces:
  - Python: class SearchProblem, AStar(search_problem, heuristic)
  - TypeScript: types for GridGraph, PlannerOptions, PlannerResult

## 11. Visualization and tooling
- Jupyter widgets for step-by-step expansions and frontier heatmaps
- Graphviz for high-level state diagrams; Matplotlib/Plotly for grid overlays
- Playback of dynamic changes (obstacle insert/remove) and replanning

## 12. Roadmap
- Milestone 1: Grid graphs + A*, Dijkstra, BFS; notebook demos and unit tests
- Milestone 2: Dynamic replanning (LPA*, D* Lite); visualizer with obstacle edits
- Milestone 3: MAPF via CBS + prioritized planning; performance profiling
- Milestone 4: Path smoothing (Theta*, funnel) and navmesh support
- Milestone 5: Real-time planning (SIPP, time windows), integrations with robotics sims

## 13. Test plan
- Unit tests per algorithm on canonical scenarios (blocked, narrow passages, weighted)
- Property tests: heuristic admissibility/consistency checks
- Regression tests on MovingAI benchmarks with golden metrics

## 14. References (starter set)
- Hart, Nilsson, Raphael (1968) — A*
- Koenig & Likhachev — D* Lite, LPA*
- Sturtevant — MovingAI benchmarks
- Sharon et al. — CBS for MAPF
- LaValle — Planning Algorithms (RRT/PRM)
