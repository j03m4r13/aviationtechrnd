# npm registry fix

This release uses the public npm registry:

```text
https://registry.npmjs.org/
```

The previous v0.1.1 archive accidentally contained lock-file download URLs from an internal build environment. Do not use those old lock files.

Verify your registry with:

```bash
npm config get registry
```

Expected:

```text
https://registry.npmjs.org/
```

Then install reproducibly with:

```bash
npm ci
```
