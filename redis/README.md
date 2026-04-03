# Redis Scaffold

This directory holds the transient session + queue coordination scaffold referenced by the MVP spec and Genesis deployment plan.

The current application still uses in-memory stores, but `docker-compose.genesis.yml` mounts this config so the project structure matches the intended production split:

- session versioning
- queue coordination
- stale-job cancellation bookkeeping
