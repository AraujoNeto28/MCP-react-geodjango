import { AppShell as MantineAppShell, Burger, Group, Text } from "@mantine/core"

export type AppHeaderProps = {
	mobileSidebarOpen: boolean
	onToggleMobileSidebar: () => void
}

export function AppHeader(props: AppHeaderProps) {
	const { mobileSidebarOpen, onToggleMobileSidebar } = props

	return (
		<MantineAppShell.Header
			style={{
				backgroundColor: "#017A73",
				borderBottom: "1px solid rgba(255, 255, 255, 0.18)",
			}}
		>
			<Group h="100%" px="md" justify="space-between" wrap="nowrap">
				<Group gap="sm" wrap="nowrap">
					<Burger
						opened={mobileSidebarOpen}
						onClick={onToggleMobileSidebar}
						hiddenFrom="sm"
						size="sm"
						color="white"
					/>
					<Text fw={700} c="white">
						MCP - Mapa Configuravel de Porto Alegre
					</Text>
				</Group>
			</Group>
		</MantineAppShell.Header>
	)
}
