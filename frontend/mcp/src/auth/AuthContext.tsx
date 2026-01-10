import { createContext, useContext } from "react"

import type React from "react"

import type { KeycloakUser } from "./keycloak"

export type AuthContextValue = {
	ready: boolean
	user: KeycloakUser
	logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
	const v = useContext(AuthContext)
	if (!v) throw new Error("useAuth must be used within <AuthProvider>")
	return v
}

export function AuthContextProvider(props: { value: AuthContextValue; children: React.ReactNode }) {
	return <AuthContext.Provider value={props.value}>{props.children}</AuthContext.Provider>
}
