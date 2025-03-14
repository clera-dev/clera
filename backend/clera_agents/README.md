# Clera Agents

This directory contains the core agentic functionality powering Clera.

## graph.py

This file is where the magic happens. We import the different tools for specialized agents and put everything together here.
This is then run on LangGraph Studio (which is why there is no memory checkpointer or storage because LangGraph Studio builds that in automatically).
