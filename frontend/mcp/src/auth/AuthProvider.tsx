import { useEffect, useMemo, useState } from "react"

import { AuthContextProvider } from "./AuthContext"
import { getKeycloakUser, hasRequiredRole, keycloak } from "./keycloak"

export function AuthProvider(props: { children: React.ReactNode }) {
	const [ready, setReady] = useState(false)
	const [user, setUser] = useState(() => getKeycloakUser())

	const redirectUri = useMemo(() => {
		// IMPORTANT: do not use the full current URL as redirectUri.
		// If Keycloak puts auth params in the URL fragment, using it as redirectUri
		// causes the redirect_uri param to grow on each login attempt (eventually 500).
		return `${window.location.origin}/`
	}, [])

	useEffect(() => {
		let cancelled = false

		;(async () => {
			try {
				const authenticated = await keycloak.init({
					onLoad: "login-required",
					pkceMethod: "S256",
					checkLoginIframe: false,
					redirectUri,
				})

				if (cancelled) return

				if (!authenticated) {
					// Should not happen with login-required, but keep it safe.
					await keycloak.login({ redirectUri })
					return
				}

				// Keycloak's auth callback often lands in the URL fragment.
				// Once processed, clear it so future redirects never include those params.
				try {
					const hash = window.location.hash
					if (hash && (hash.includes("code=") || hash.includes("session_state=") || hash.includes("state="))) {
						window.history.replaceState(null, document.title, window.location.pathname + window.location.search)
					}
				} catch {
					// ignore
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
							await keycloak.login({ redirectUri })
						} catch {
							// ignore
						}
					}
				}
			} catch {
				// If init fails, force a fresh login.
				try {
					await keycloak.login({ redirectUri })
				} catch {
					// ignore
				}
			}
		})()

		return () => {
			cancelled = true
		}
	}, [redirectUri])

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
