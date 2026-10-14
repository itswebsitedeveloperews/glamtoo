---
name: Workspace declaration rebuild
description: Composite workspace project references can retain stale declarations despite correct source exports.
---

When a dependent package reports a missing export that exists in source, check the referenced library's generated declarations before changing the contract. Build that library before typechecking the consumer.

**Why:** Composite project references can resolve stale declarations even when the linked source barrel already exports the symbol. This affects database schemas and generated API client types; regenerating contracts or replacing correct imports would address the wrong problem.

**How to apply:** Build only the affected referenced library with `tsc --build` before checking its consumer. Standalone typecheck commands that rely on generated library declarations should refresh those declarations themselves, rather than relying on a prior root build.