import { App, PluginSettingTab, Setting, TFile, Notice, TFolder } from "obsidian";
import FileSyncPlugin from "./main";

export interface FileSyncSettings {
	destinationPath: string;
	selectedFiles: string[];
	fileTypeFilter: string;
	collapsedFolders: string[];
}

export const DEFAULT_SETTINGS: FileSyncSettings = {
	destinationPath: '',
	selectedFiles: [],
	fileTypeFilter: 'all',
	collapsedFolders: []
}

export class FileSyncSettingTab extends PluginSettingTab {
	plugin: FileSyncPlugin;
	private tempSelectedFiles: string[];
	private hasUnsavedChanges: boolean = false;

	constructor(app: App, plugin: FileSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.tempSelectedFiles = [...plugin.settings.selectedFiles];
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'File Sync Plugin Settings' });

		// Destination path setting with folder picker
		const destSetting = new Setting(containerEl)
			.setName('Destination Path')
			.setDesc('Specify the directory where files will be copied');

		destSetting.addText(text => text
			.setPlaceholder('D:\\destination')
			.setValue(this.plugin.settings.destinationPath)
			.onChange(async (value) => {
				this.plugin.settings.destinationPath = value;
				await this.plugin.saveSettings();
			}));

		destSetting.addButton(button => button
			.setButtonText('Browse')
			.onClick(async () => {
				// Use Electron dialog to pick folder
				const { dialog } = require('electron').remote;
				const result = await dialog.showOpenDialog({
					properties: ['openDirectory']
				});

				if (!result.canceled && result.filePaths.length > 0) {
					this.plugin.settings.destinationPath = result.filePaths[0];
					await this.plugin.saveSettings();
					this.display(); // Refresh to show new path
				}
			}));

		// File type filter
		const filterSetting = new Setting(containerEl)
			.setName('File Type Filter')
			.setDesc('Filter files by extension');

		filterSetting.addDropdown(dropdown => {
			dropdown
				.addOption('all', 'All Files')
				.addOption('.md', 'Markdown (.md)')
				.addOption('.png', 'PNG Images (.png)')
				.addOption('.jpg', 'JPEG Images (.jpg)')
				.addOption('.pdf', 'PDF Documents (.pdf)')
				.addOption('.txt', 'Text Files (.txt)')
				.setValue(this.plugin.settings.fileTypeFilter)
				.onChange(async (value) => {
					this.plugin.settings.fileTypeFilter = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to update file list
				});
		});

		// Batch selection buttons and Save button
		const buttonContainer = containerEl.createDiv({ cls: 'file-sync-button-container' });
		buttonContainer.style.marginBottom = '10px';
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.flexWrap = 'wrap';

		const selectAllBtn = buttonContainer.createEl('button', { text: 'Select All (Current Filter)' });
		selectAllBtn.addEventListener('click', () => {
			const files = this.getFilteredFiles();
			this.tempSelectedFiles = files.map(f => f.path);
			this.hasUnsavedChanges = true;
			this.display();
		});

		const deselectAllBtn = buttonContainer.createEl('button', { text: 'Deselect All' });
		deselectAllBtn.addEventListener('click', () => {
			this.tempSelectedFiles = [];
			this.hasUnsavedChanges = true;
			this.display();
		});

		// Save button (highlighted if there are unsaved changes)
		const saveBtn = buttonContainer.createEl('button', { text: 'Save Selection' });
		if (this.hasUnsavedChanges) {
			saveBtn.style.backgroundColor = 'var(--interactive-accent)';
			saveBtn.style.color = 'var(--text-on-accent)';
			saveBtn.style.fontWeight = 'bold';
		}
		saveBtn.addEventListener('click', async () => {
			this.plugin.settings.selectedFiles = [...this.tempSelectedFiles];
			await this.plugin.saveSettings();
			this.hasUnsavedChanges = false;
			new Notice('File selection saved');
			this.display();
		});

		// Folder expand/collapse buttons
		const folderButtonContainer = containerEl.createDiv({ cls: 'file-sync-folder-buttons' });
		folderButtonContainer.style.marginBottom = '10px';
		folderButtonContainer.style.display = 'flex';
		folderButtonContainer.style.gap = '10px';

		const expandAllBtn = folderButtonContainer.createEl('button', { text: 'Expand All Folders' });
		expandAllBtn.addEventListener('click', async () => {
			this.plugin.settings.collapsedFolders = [];
			await this.plugin.saveSettings();
			this.display();
		});

		const collapseAllBtn = folderButtonContainer.createEl('button', { text: 'Collapse All Folders' });
		collapseAllBtn.addEventListener('click', async () => {
			// Get all folder paths
			const files = this.getFilteredFiles();
			const folderPaths = new Set<string>();
			for (const file of files) {
				const folderPath = file.parent?.path;
				if (folderPath && folderPath !== '/') {
					folderPaths.add(folderPath);
				}
			}
			this.plugin.settings.collapsedFolders = Array.from(folderPaths);
			await this.plugin.saveSettings();
			this.display();
		});


		// File count display
		const files = this.getFilteredFiles();
		const selectedCount = this.tempSelectedFiles.length;
		const totalCount = files.length;
		const statusText = this.hasUnsavedChanges
			? `Selected: ${selectedCount} / ${totalCount} files (unsaved changes)`
			: `Selected: ${selectedCount} / ${totalCount} files`;

		const statusEl = containerEl.createEl('p', {
			text: statusText,
			cls: 'file-sync-count'
		});
		if (this.hasUnsavedChanges) {
			statusEl.style.color = 'var(--text-warning)';
			statusEl.style.fontWeight = 'bold';
		}

		// File tree with checkboxes
		const fileListContainer = containerEl.createDiv({ cls: 'file-sync-file-list' });
		fileListContainer.style.maxHeight = '400px';
		fileListContainer.style.overflowY = 'auto';
		fileListContainer.style.border = '1px solid var(--background-modifier-border)';
		fileListContainer.style.padding = '10px';
		fileListContainer.style.borderRadius = '4px';

		if (files.length === 0) {
			fileListContainer.createEl('p', {
				text: 'No files found matching the filter.',
				cls: 'file-sync-empty'
			});
		} else {
			this.renderFileTree(fileListContainer, files);
		}
	}

	getFilteredFiles(): TFile[] {
		const allFiles = this.app.vault.getFiles();
		const filter = this.plugin.settings.fileTypeFilter;

		if (filter === 'all') {
			return allFiles;
		}

		return allFiles.filter(file => file.extension === filter.replace('.', ''));
	}

	renderFileTree(container: HTMLElement, files: TFile[]): void {
		// Group files by folder
		const filesByFolder = new Map<string, TFile[]>();

		for (const file of files) {
			const folderPath = file.parent?.path || '/';
			if (!filesByFolder.has(folderPath)) {
				filesByFolder.set(folderPath, []);
			}
			filesByFolder.get(folderPath)!.push(file);
		}

		// Sort folders
		const sortedFolders = Array.from(filesByFolder.keys()).sort();

		for (const folderPath of sortedFolders) {
			const folderFiles = filesByFolder.get(folderPath)!.sort((a, b) => a.name.localeCompare(b.name));

			// Create folder header if not root
			if (folderPath !== '/') {
				const folderHeader = container.createEl('div', { cls: 'file-sync-folder-header' });
				folderHeader.style.fontWeight = 'bold';
				folderHeader.style.marginTop = '8px';
				folderHeader.style.marginBottom = '4px';
				folderHeader.style.color = 'var(--text-muted)';
				folderHeader.style.cursor = 'pointer';
				folderHeader.style.display = 'flex';
				folderHeader.style.alignItems = 'center';
				folderHeader.style.gap = '8px';

				const isCollapsed = this.plugin.settings.collapsedFolders.includes(folderPath);

				// Collapse/expand icon
				const icon = folderHeader.createEl('span', {
					text: isCollapsed ? '▶' : '▼',
					cls: 'file-sync-collapse-icon'
				});
				icon.style.fontSize = '10px';

				// Folder checkbox for selecting all files in folder
				const folderCheckbox = folderHeader.createEl('input', { type: 'checkbox' });
				const allFilesInFolder = folderFiles.map(f => f.path);
				const selectedFilesInFolder = allFilesInFolder.filter(path =>
					this.tempSelectedFiles.includes(path)
				);
				folderCheckbox.checked = selectedFilesInFolder.length === allFilesInFolder.length && allFilesInFolder.length > 0;
				folderCheckbox.indeterminate = selectedFilesInFolder.length > 0 && selectedFilesInFolder.length < allFilesInFolder.length;

				folderCheckbox.addEventListener('click', (e) => {
					e.stopPropagation(); // Prevent folder collapse/expand
					if (folderCheckbox.checked) {
						// Select all files in folder
						for (const filePath of allFilesInFolder) {
							if (!this.tempSelectedFiles.includes(filePath)) {
								this.tempSelectedFiles.push(filePath);
							}
						}
					} else {
						// Deselect all files in folder
						this.tempSelectedFiles = this.tempSelectedFiles.filter(
							path => !allFilesInFolder.includes(path)
						);
					}
					this.hasUnsavedChanges = true;
					this.display();
				});

				// Folder name
				const folderName = folderHeader.createEl('span', { text: folderPath });

				// Toggle collapse on folder header click
				folderHeader.addEventListener('click', async (e) => {
					if (e.target !== folderCheckbox) {
						if (isCollapsed) {
							this.plugin.settings.collapsedFolders = this.plugin.settings.collapsedFolders.filter(
								f => f !== folderPath
							);
						} else {
							this.plugin.settings.collapsedFolders.push(folderPath);
						}
						await this.plugin.saveSettings();
						this.display();
					}
				});

				// Skip rendering files if folder is collapsed
				if (isCollapsed) {
					continue;
				}
			}

			// Create file checkboxes
			for (const file of folderFiles) {
				const fileItem = container.createEl('div', { cls: 'file-sync-file-item' });
				fileItem.style.display = 'flex';
				fileItem.style.alignItems = 'center';
				fileItem.style.padding = '2px 0 2px 20px';

				const checkbox = fileItem.createEl('input', { type: 'checkbox' });
				checkbox.checked = this.tempSelectedFiles.includes(file.path);
				checkbox.style.marginRight = '8px';
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						if (!this.tempSelectedFiles.includes(file.path)) {
							this.tempSelectedFiles.push(file.path);
						}
					} else {
						this.tempSelectedFiles = this.tempSelectedFiles.filter(
							path => path !== file.path
						);
					}
					this.hasUnsavedChanges = true;
					this.display();
				});

				const label = fileItem.createEl('label', { text: file.name });
				label.style.cursor = 'pointer';
				label.addEventListener('click', () => {
					checkbox.click();
				});
			}
		}
	}
}
