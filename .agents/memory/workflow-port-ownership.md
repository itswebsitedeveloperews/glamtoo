---
name: Workflow port ownership
description: Failed workflow status does not reliably establish whether its server has stopped.
---

Treat workflow state and actual port ownership as separate facts.

**Why:** Automatic post-merge reconciliation reported failed frontend and API workflows while earlier instances of those services still held their ports. Another startup then failed with address-in-use errors despite the existing servers being reachable.

**How to apply:** When a failed workflow reports an occupied port, identify the listener and stop the existing managed workflow before starting it again. Do not change service ports or add replacement workflows to work around an existing listener.
