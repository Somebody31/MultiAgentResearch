# LangGraph basics

LangGraph is a library for building stateful multi-step AI workflows as a graph.

- Nodes are steps (functions).
- Edges decide what runs next.
- State is shared data that nodes read and update.
- Send() starts one node many times in parallel (map-reduce style).
- Conditional edges route based on state (for example pass vs revise).

This project uses LangGraph to run: plan → research → normalize → verify → final.
