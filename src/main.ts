import { Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, FileSyncSettings, FileSyncSettingTab } from "./settings";
import * as fs from 'fs';
import * as path from 'path';

export default class FileSyncPlugin extends Plugin {
	settings: FileSyncSettings;
	private logFilePath: string;

	async onload() {
		await this.loadSettings();

		// Set log file path to plugin directory
		this.logFilePath = path.join(this.manifest.dir || '', 'sync-errors.log');

		// Add ribbon icon for one-click sync
		this.addRibbonIcon('sync', 'Sync files to destination', async (evt: MouseEvent) => {
			await this.syncFiles();
		});

		// Add command for sync
		this.addCommand({
			id: 'sync-files',
			name: 'Sync selected files to destination',
			callback: async () => {
				await this.syncFiles();
			}
		});

		// Add settings tab
		this.addSettingTab(new FileSyncSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<FileSyncSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async syncFiles() {
		// Validate destination path
		if (!this.settings.destinationPath) {
			new Notice('Please set a destination path in settings first', 5000);
			return;
		}

		// Check if destination exists
		if (!fs.existsSync(this.settings.destinationPath)) {
			new Notice('Destination path does not exist', 5000);
			return;
		}

		// Check if there are selected files
		if (this.settings.selectedFiles.length === 0) {
			new Notice('No files selected. Please select files in settings first', 5000);
			return;
		}

		new Notice(`Starting sync of ${this.settings.selectedFiles.length} files...`);

		let successCount = 0;
		let errorCount = 0;
		const errors: string[] = [];
		const timestamp = new Date().toISOString();

		// Start error log
		const logHeader = `\n=== Sync Started at ${timestamp} ===\n`;
		errors.push(logHeader);

		for (const filePath of this.settings.selectedFiles) {
			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);

				if (!file || !(file instanceof TFile)) {
					const errorMsg = `File not found: ${filePath}`;
					errors.push(errorMsg);
					errorCount++;
					continue;
				}

			// Read file content
			const content = await this.app.vault.readBinary(file);

			// Calculate destination path (maintain folder structure)
			const relativePath = filePath;
			const destFilePath = path.join(this.settings.destinationPath, relativePath);

			// Create destination directory if it doesn't exist
			const destDir = path.dirname(destFilePath);
			if (!fs.existsSync(destDir)) {
				fs.mkdirSync(destDir, { recursive: true });
			}

			// Write file to destination
			// Convert ArrayBuffer to Buffer for Node.js fs
			const buffer = new Uint8Array(content);
			fs.writeFileSync(destFilePath, buffer);
				successCount++;
			} catch (error) {
				errorCount++;
				const errorMsg = error instanceof Error ? error.message : String(error);
				errors.push(`${filePath}: ${errorMsg}`);
			}
		}

		// Write errors to log file if any occurred
		if (errorCount > 0) {
			const logSummary = `\nTotal: ${successCount} succeeded, ${errorCount} failed\n`;
			errors.push(logSummary);

			try {
				fs.appendFileSync(this.logFilePath, errors.join('\n') + '\n');
			} catch (logError) {
				console.error('Failed to write error log:', logError);
			}
		}

		// Show summary
		if (errorCount === 0) {
			new Notice(`Successfully synced ${successCount} files!`, 5000);
		} else {
			new Notice(`Synced ${successCount} files with ${errorCount} errors. Check sync-errors.log in plugin folder.`, 7000);
		}
	}
}
