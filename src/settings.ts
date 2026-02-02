import { App, PluginSettingTab, Setting, TFile, Notice } from "obsidian";
import FileSyncPlugin from "./main";

export interface FileSyncSettings {
	destinationPath: string;
	selectedFiles: string[];
	lastSyncTimes: Record<string, number>;
	fileTypeFilter: string;
	collapsedFolders: string[];
	allowSyncOutsideScope: boolean;
}

export const DEFAULT_SETTINGS: FileSyncSettings = {
	destinationPath: '',
	selectedFiles: [],
	lastSyncTimes: {},
	fileTypeFilter: 'all',
	collapsedFolders: [],
	allowSyncOutsideScope: false
}

export class FileSyncSettingTab extends PluginSettingTab {
	plugin: FileSyncPlugin;
	private tempSelectedFiles: string[];
	private hasUnsavedChanges: boolean = false;
	private scrollPosition: number = 0;
	private fileListContainer: HTMLElement | null = null;

	constructor(app: App, plugin: FileSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.tempSelectedFiles = [...plugin.settings.selectedFiles];
	}

	display(): void {
		const { containerEl } = this;

		// Save scroll position before clearing
		if (this.fileListContainer) {
			this.scrollPosition = this.fileListContainer.scrollTop;
		}

		containerEl.empty();

		new Setting(containerEl)
			.setName('Synchronization')
			.setHeading();

		// Destination path setting
		new Setting(containerEl)
			.setName('Destination path')
			.setDesc('Specify the directory where files will be copied (e.g., D:\\destination)')
			.addText(text => text
				.setPlaceholder('D:\\destination')
				.setValue(this.plugin.settings.destinationPath)
				.onChange(async (value) => {
					this.plugin.settings.destinationPath = value;
					await this.plugin.saveSettings();
				}));

		// Allow sync outside scope setting
		new Setting(containerEl)
			.setName('Allow syncing files outside monitored scope')
			.setDesc('If enabled, the "Sync current file" command will work for any file, even if it is not selected in the list below.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.allowSyncOutsideScope)
				.onChange(async (value) => {
					this.plugin.settings.allowSyncOutsideScope = value;
					await this.plugin.saveSettings();
				}));

		// File type filter
		const filterSetting = new Setting(containerEl)
			.setName('File type filter')
			.setDesc('Filter files by extension');

		filterSetting.addDropdown(dropdown => {
			dropdown
				.addOption('all', 'All files')
				.addOption('.md', 'Markdown')
				.addOption('.png', 'PNG images')
				.addOption('.jpg', 'JPEG images')
				.addOption('.pdf', 'PDF documents')
				.addOption('.txt', 'Text')
				.setValue(this.plugin.settings.fileTypeFilter)
				.onChange(async (value) => {
					this.plugin.settings.fileTypeFilter = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to update file list
				});
		});

		// Batch selection and folder management buttons
		const buttonContainer = containerEl.createDiv({ cls: 'file-sync-button-container' });

		// Smart toggle button for Select All / Deselect All
		const files = this.getFilteredFiles();
		const allFilePaths = files.map(f => f.path);
		const allSelected = allFilePaths.length > 0 && allFilePaths.every(path => this.tempSelectedFiles.includes(path));

		const selectToggleBtn = buttonContainer.createEl('button', {
			text: allSelected ? 'Deselect all' : 'Select all'
		});
		selectToggleBtn.addEventListener('click', () => {
			if (allSelected) {
				// Deselect all filtered files
				this.tempSelectedFiles = this.tempSelectedFiles.filter(
					path => !allFilePaths.includes(path)
				);
			} else {
				// Select all filtered files
				for (const filePath of allFilePaths) {
					if (!this.tempSelectedFiles.includes(filePath)) {
						this.tempSelectedFiles.push(filePath);
					}
				}
			}
			this.hasUnsavedChanges = true;
			this.display();
		});

		// Folder toggle button (unified expand/collapse)
		const allFolderPaths = new Set<string>();
		for (const file of files) {
			const folderPath = file.parent?.path;
			if (folderPath && folderPath !== '/') {
				allFolderPaths.add(folderPath);
			}
		}

		const totalFolders = allFolderPaths.size;
		const collapsedCount = this.plugin.settings.collapsedFolders.length;
		const isCurrentlyCollapsed = collapsedCount > totalFolders / 2;

		const toggleFoldersBtn = buttonContainer.createEl('button', {
			text: isCurrentlyCollapsed ? 'Expand' : 'Collapse'
		});
		toggleFoldersBtn.addEventListener('click', () => {
			void (async () => {
				if (isCurrentlyCollapsed) {
					// Expand all
					this.plugin.settings.collapsedFolders = [];
				} else {
					// Collapse all
					this.plugin.settings.collapsedFolders = Array.from(allFolderPaths);
				}
				await this.plugin.saveSettings();
				this.display();
			})();
		});

		// File count display
		const selectedCount = this.tempSelectedFiles.length;
		const totalCount = files.length;
		const statusText = this.hasUnsavedChanges
			? `Selected: ${selectedCount} / ${totalCount} files (unsaved changes)`
			: `Selected: ${selectedCount} / ${totalCount} files`;

		containerEl.createEl('p', {
			text: statusText,
			cls: this.hasUnsavedChanges ? 'file-sync-count unsaved' : 'file-sync-count'
		});

		// File tree with checkboxes
		this.fileListContainer = containerEl.createDiv({ cls: 'file-sync-file-list' });

		if (files.length === 0) {
			this.fileListContainer.createEl('p', {
				text: 'No files found matching the filter.',
				cls: 'file-sync-empty'
			});
		} else {
			this.renderFileTree(this.fileListContainer, files);
		}

		// Restore scroll position after rendering
		if (this.scrollPosition > 0) {
			this.fileListContainer.scrollTop = this.scrollPosition;
		}

		// Save button at the bottom
		const saveButtonContainer = containerEl.createDiv({ cls: 'file-sync-save-container' });

		const saveBtn = saveButtonContainer.createEl('button', {
			text: 'Save',
			cls: this.hasUnsavedChanges ? 'unsaved' : ''
		});

		saveBtn.addEventListener('click', () => {
			void (async () => {
				this.plugin.settings.selectedFiles = [...this.tempSelectedFiles];
				await this.plugin.saveSettings();
				this.hasUnsavedChanges = false;
				new Notice('File selection saved');
				this.display();
			})();
		});
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
		// Build folder hierarchy
		const folderHierarchy = this.buildFolderHierarchy(files);

		// Render the tree
		this.renderFolderNode(container, folderHierarchy, 0);
	}

	buildFolderHierarchy(files: TFile[]): FolderNode {
		const root: FolderNode = {
			path: '/',
			name: '/',
			children: new Map(),
			files: []
		};

		// Group files by folder
		for (const file of files) {
			const folderPath = file.parent?.path || '/';
			const parts = folderPath === '/' ? [] : folderPath.split('/');

			let currentNode = root;
			let currentPath = '';

			// Build folder hierarchy
			for (const part of parts) {
				currentPath = currentPath === '' ? part : `${currentPath}/${part}`;

				if (!currentNode.children.has(currentPath)) {
					currentNode.children.set(currentPath, {
						path: currentPath,
						name: part,
						children: new Map(),
						files: []
					});
				}
				currentNode = currentNode.children.get(currentPath)!;
			}

			// Add file to the appropriate folder node
			currentNode.files.push(file);
		}

		return root;
	}

	renderFolderNode(container: HTMLElement, node: FolderNode, depth: number): void {
		// Sort folders alphabetically
		const sortedFolders = Array.from(node.children.values()).sort((a, b) =>
			a.name.localeCompare(b.name)
		);

		// Render child folders
		for (const childNode of sortedFolders) {
			const isCollapsed = this.plugin.settings.collapsedFolders.includes(childNode.path);

			// Folder header
			const folderHeader = container.createEl('div', { cls: 'file-sync-folder-header' });
			// Set dynamic indentation based on depth
			folderHeader.style.paddingLeft = `${depth * 20}px`;

			// Collapse/expand icon
			folderHeader.createEl('span', {
				text: isCollapsed ? '▶' : '▼',
				cls: 'file-sync-collapse-icon'
			});

			// Get all files in this folder and subfolders
			const allFilesInFolder = this.getAllFilesInNode(childNode);
			const allFilePaths = allFilesInFolder.map(f => f.path);
			const selectedFilesInFolder = allFilePaths.filter(path =>
				this.tempSelectedFiles.includes(path)
			);

			// Folder checkbox
			const folderCheckbox = folderHeader.createEl('input', { type: 'checkbox' });
			folderCheckbox.checked = selectedFilesInFolder.length === allFilePaths.length && allFilePaths.length > 0;
			folderCheckbox.indeterminate = selectedFilesInFolder.length > 0 && selectedFilesInFolder.length < allFilePaths.length;

			folderCheckbox.addEventListener('click', (e) => {
				e.stopPropagation();
				if (folderCheckbox.checked) {
					// Select all files in folder
					for (const filePath of allFilePaths) {
						if (!this.tempSelectedFiles.includes(filePath)) {
							this.tempSelectedFiles.push(filePath);
						}
					}
				} else {
					// Deselect all files in folder
					this.tempSelectedFiles = this.tempSelectedFiles.filter(
						path => !allFilePaths.includes(path)
					);
				}
				this.hasUnsavedChanges = true;
				this.display();
			});

			// Folder name
			folderHeader.createEl('span', { text: childNode.name });

			// Toggle collapse on folder header click
			folderHeader.addEventListener('click', (e) => {
				if (e.target !== folderCheckbox) {
					void (async () => {
						if (isCollapsed) {
							this.plugin.settings.collapsedFolders = this.plugin.settings.collapsedFolders.filter(
								f => f !== childNode.path
							);
						} else {
							this.plugin.settings.collapsedFolders.push(childNode.path);
						}
						await this.plugin.saveSettings();
						this.display();
					})();
				}
			});

			// If not collapsed, render contents
			if (!isCollapsed) {
				// Render files in this folder (sorted)
				const sortedFiles = childNode.files.sort((a, b) => a.name.localeCompare(b.name));
				for (const file of sortedFiles) {
					this.renderFileItem(container, file, depth + 1);
				}

				// Recursively render child folders
				this.renderFolderNode(container, childNode, depth + 1);
			}
		}

		// Render files in the current node (root level files)
		if (depth === 0) {
			const sortedFiles = node.files.sort((a, b) => a.name.localeCompare(b.name));
			for (const file of sortedFiles) {
				this.renderFileItem(container, file, depth);
			}
		}
	}

	renderFileItem(container: HTMLElement, file: TFile, depth: number): void {
		const fileItem = container.createEl('div', { cls: 'file-sync-file-item' });
		// Set dynamic indentation based on depth
		fileItem.style.paddingLeft = `${depth * 20 + 20}px`; // Extra indent for files

		const checkbox = fileItem.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.tempSelectedFiles.includes(file.path);
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
		label.addEventListener('click', () => {
			checkbox.click();
		});
	}

	getAllFilesInNode(node: FolderNode): TFile[] {
		let files = [...node.files];
		for (const child of node.children.values()) {
			files = files.concat(this.getAllFilesInNode(child));
		}
		return files;
	}
}

interface FolderNode {
	path: string;
	name: string;
	children: Map<string, FolderNode>;
	files: TFile[];
}
