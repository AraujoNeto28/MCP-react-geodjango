// React 19 ships a CJS entry point. Some bundled dependencies (e.g. Mantine) access
// React via `React.default.*` in certain builds. Rolldown-vite's CJS->ESM interop can
// omit the default export, which breaks at runtime.
//
// This module forces a stable shape: it always provides a default export *and*
// re-exports named React APIs.

// @ts-expect-error - importing React CJS entry directly for bundler interop
import ReactDefault from "../../node_modules/react/index.js"

export default ReactDefault
// @ts-expect-error - importing React CJS entry directly for bundler interop
export * from "../../node_modules/react/index.js"
