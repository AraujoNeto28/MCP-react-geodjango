import { useEffect, useMemo, useState } from "react"

import { AuthContextProvider } from "./AuthContext"
import { getKeycloakUser, hasRequiredRole, keycloak } from "./keycloak"

export function AuthProvider(props: { children: React.ReactNode }) {
	const [ready, setReady] = useState(false)
	const [user, setUser] = useState(() => getKeycloakUser())

	useEffect(() => {
		let cancelled = false

		;(async () => {
			try {
				const authenticated = await keycloak.init({
					onLoad: "login-required",
					pkceMethod: "S256",
					checkLoginIframe: false,
				})

				if (cancelled) return

				if (!authenticated) {
					// Should not happen with login-required, but keep it safe.
					await keycloak.login()
					return
				}

				if (!hasRequiredRole()) {
					window.location.replace("/access-denied.html")
					return
				}

				setUser(getKeycloakUser())
				setReady(true)

				keycloak.onTokenExpired = async () => {
					try {
						await keycloak.updateToken(30)
						setUser(getKeycloakUser())
					} catch {
						// If refresh fails, force re-login.
						try {
							await keycloak.login()
						} catch {
							// ignore
						}
					}
				}
			} catch {
				// If init fails, force a fresh login.
				try {
					await keycloak.login()
				} catch {
					// ignore
				}
			}
		})()

		return () => {
			cancelled = true
		}
	}, [])

	const value = useMemo(
		() => ({
			ready,
			user,
			logout: () => {
				try {
					keycloak.logout({ redirectUri: window.location.origin })
				} catch {
					// ignore
				}
			},
		}),
		[ready, user],
	)

	// While redirecting to Keycloak, keep the screen blank (no extra UX requested).
	if (!ready) return null

	return <AuthContextProvider value={value}>{props.children}</AuthContextProvider>
}
