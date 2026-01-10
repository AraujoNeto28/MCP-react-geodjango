import Keycloak from "keycloak-js"

import { KEYCLOAK_CLIENT_ID, KEYCLOAK_REALM, KEYCLOAK_URL, REQUIRED_ROLE } from "./keycloakConstants"

export const keycloak = new Keycloak({
	url: KEYCLOAK_URL,
	realm: KEYCLOAK_REALM,
	clientId: KEYCLOAK_CLIENT_ID,
})

export type KeycloakUser = {
	name: string | null
	username: string | null
}

export function getKeycloakUser(): KeycloakUser {
	const parsed: any = keycloak.tokenParsed ?? null
	const name = typeof parsed?.name === "string" ? parsed.name : null
	const username =
		typeof parsed?.preferred_username === "string"
			? parsed.preferred_username
			: typeof parsed?.username === "string"
				? parsed.username
				: null
	return { name, username }
}

export function hasRequiredRole(): boolean {
	try {
		if (keycloak.hasRealmRole(REQUIRED_ROLE)) return true
		if (keycloak.hasResourceRole(REQUIRED_ROLE, KEYCLOAK_CLIENT_ID)) return true
	} catch {
		// ignore
	}

	const parsed: any = keycloak.tokenParsed ?? null
	const realmRoles: unknown = parsed?.realm_access?.roles
	if (Array.isArray(realmRoles) && realmRoles.includes(REQUIRED_ROLE)) return true

	const clientRoles: unknown = parsed?.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles
	if (Array.isArray(clientRoles) && clientRoles.includes(REQUIRED_ROLE)) return true

	return false
}

export async function ensureFreshToken(minValiditySeconds = 30): Promise<string | null> {
	if (!keycloak.token) return null
	try {
		await keycloak.updateToken(minValiditySeconds)
	} catch {
		// If refresh fails, keep the current token (backend will 401).
	}
	return keycloak.token ?? null
}
