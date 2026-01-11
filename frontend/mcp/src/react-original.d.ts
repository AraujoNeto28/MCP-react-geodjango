declare module "react-original" {
	import type * as ReactNamespace from "react"

	const ReactDefault: typeof ReactNamespace
	export default ReactDefault
	export * from "react"
}
