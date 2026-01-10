import { AppShellContainer } from "./AppShellContainer"

import "@mantine/core/styles.css"
import "@mantine/dates/styles.css"
import "@mantine/notifications/styles.css"
import "@mantine/code-highlight/styles.css"
import "@mantine/tiptap/styles.css"
import "@mantine/dropzone/styles.css"
import "@mantine/carousel/styles.css"
import "@mantine/spotlight/styles.css"
import "@mantine/nprogress/styles.css"

import { MantineProvider } from "@mantine/core"
import { AuthProvider } from "./auth/AuthProvider"

export default function App() {
  return (
    <MantineProvider>
			<AuthProvider>
				<AppShellContainer />
			</AuthProvider>
    </MantineProvider>
  )
}
