// Rolldown-vite + React 19 (CJS) can prebundle `react` as a default-only module in dev,
// which breaks `import { useEffect } from "react"`.
//
// This shim guarantees:
// - a default export (for libs that do `React.default.*`)
// - explicit named exports for the React APIs we use in-app

import type * as ReactTypes from "react"

// @ts-expect-error - import React CJS entry directly for bundler interop
import ReactCjs from "../../node_modules/react/index.js"

const ReactNs = ReactCjs as unknown as typeof ReactTypes

export default ReactNs

// React 19 internals used by react-dom. If this is missing, react-dom can crash
// very early in dev with errors like "Cannot read properties of undefined".
// (React 18 used __SECRET_INTERNALS..., React 19 uses __CLIENT_INTERNALS...)
export const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

// React Compiler runtime export (present in React 19)
export const __COMPILER_RUNTIME =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).__COMPILER_RUNTIME

export const Children = ReactNs.Children
export const Component = ReactNs.Component
export const Fragment = ReactNs.Fragment
export const Profiler = ReactNs.Profiler
export const PureComponent = ReactNs.PureComponent
export const StrictMode = ReactNs.StrictMode
export const Suspense = ReactNs.Suspense

export const Activity =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).Activity

export const cloneElement = ReactNs.cloneElement
export const createContext = ReactNs.createContext
export const createElement = ReactNs.createElement
export const createRef = ReactNs.createRef
export const forwardRef = ReactNs.forwardRef
export const isValidElement = ReactNs.isValidElement
export const lazy = ReactNs.lazy
export const memo = ReactNs.memo
export const startTransition = ReactNs.startTransition

export const act =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).act

export const cache =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).cache

export const cacheSignal =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).cacheSignal

export const captureOwnerStack =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).captureOwnerStack
export const useCallback = ReactNs.useCallback
export const useContext = ReactNs.useContext
export const useDebugValue = ReactNs.useDebugValue
export const useDeferredValue = ReactNs.useDeferredValue
export const useEffect = ReactNs.useEffect
export const useId = ReactNs.useId
export const useImperativeHandle = ReactNs.useImperativeHandle
export const useInsertionEffect = ReactNs.useInsertionEffect
export const useLayoutEffect = ReactNs.useLayoutEffect
export const useMemo = ReactNs.useMemo
export const useReducer = ReactNs.useReducer
export const useRef = ReactNs.useRef
export const useState = ReactNs.useState
export const useSyncExternalStore = ReactNs.useSyncExternalStore
export const useTransition = ReactNs.useTransition

export const use =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).use

export const useActionState =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).useActionState

export const useEffectEvent =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).useEffectEvent

export const useOptimistic =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).useOptimistic

export const unstable_useCacheRefresh =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ReactNs as any).unstable_useCacheRefresh

export const version = ReactNs.version
