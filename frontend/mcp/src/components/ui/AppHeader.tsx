import { AppShell as MantineAppShell, Burger, Group, Text } from "@mantine/core"

export type AppHeaderProps = {
	mobileSidebarOpen: boolean
	onToggleMobileSidebar: () => void
}

export function AppHeader(props: AppHeaderProps) {
	const { mobileSidebarOpen, onToggleMobileSidebar } = props

	return (
		<MantineAppShell.Header>
			<Group h="100%" px="md" justify="space-between" wrap="nowrap">
				<Group gap="sm" wrap="nowrap">
					<Burger opened={mobileSidebarOpen} onClick={onToggleMobileSidebar} hiddenFrom="sm" size="sm" />
					<Text fw={700}>WebGIS</Text>
				</Group>
			</Group>
		</MantineAppShell.Header>
	)
}
