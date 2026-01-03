export type HttpError = {
  status: number
  message: string
}

export async function httpGetJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw {
      status: resp.status,
      message: text || resp.statusText,
    } satisfies HttpError
  }

  return (await resp.json()) as T
}
