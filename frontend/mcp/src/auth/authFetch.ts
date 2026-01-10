import { ensureFreshToken } from "./keycloak"

function extractPreferredUsername(token: string): string {
	try {
		const payloadPart = token.split(".")[1] ?? ""
		const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/")
		const json = atob(base64)
		const payload = JSON.parse(json) as { preferred_username?: unknown }
		return typeof payload.preferred_username === "string" ? payload.preferred_username : ""
	} catch {
		return ""
	}
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const token = await ensureFreshToken(30)

	const headers = new Headers(init?.headers ?? undefined)
	if (token) {
		headers.set("Authorization", `Bearer ${token}`)
		const preferredUsername = extractPreferredUsername(token)
		if (preferredUsername) headers.set("X-Preferred-Username", preferredUsername)
	}

	return fetch(input, {
		...init,
		headers,
	})
}
