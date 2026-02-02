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

		// Add command for syncing current file
		this.addCommand({
			id: 'sync-current-file',
			name: 'Sync current file',
			callback: async () => {
				await this.syncCurrentFile();
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

	async syncCurrentFile() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file to sync', 5000);
			return;
		}

		// Check if destination path is set
		if (!this.settings.destinationPath) {
			new Notice('Please set a destination path in settings first', 5000);
			return;
		}

		// Check if destination exists
		if (!fs.existsSync(this.settings.destinationPath)) {
			new Notice('Destination path does not exist', 5000);
			return;
		}

		// Check scope logic
		const isMonitored = this.settings.selectedFiles.includes(activeFile.path);

		if (!this.settings.allowSyncOutsideScope && !isMonitored) {
			new Notice('Current file is not in the monitored scope. Enable "allow syncing files outside monitored scope" in settings to override.', 5000);
			return;
		}

		try {
			// Perform sync for single file
			await this.performFileSync(activeFile);

			// Save settings to update last sync time
			await this.saveSettings();

			new Notice(`Successfully synced ${activeFile.name}!`, 3000);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`Failed to sync ${activeFile.name}: ${errorMsg}`, 5000);
			console.error('Sync error:', error);
		}
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

		const timestamp = new Date().toISOString();
		new Notice('Starting sync check...');

		let successCount = 0;
		let skippedCount = 0;
		let errorCount = 0;
		const errors: string[] = [];
		let hasUpdates = false;

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

				// Get fresh stats from adapter to ensure we catch external changes
				const stat = await this.app.vault.adapter.stat(file.path);

				if (!stat) {
					const errorMsg = `Could not get stats for file: ${filePath}`;
					errors.push(errorMsg);
					errorCount++;
					continue;
				}

				const lastSyncTime = this.settings.lastSyncTimes[filePath] || 0;

				// Smart Sync Logic: Only sync if modified since last sync
				if (stat.mtime > lastSyncTime) {
					// Pass stat.mtime so we record the version we decided to sync, avoiding race where
					// file is modified between this check and the stat inside performFileSync().
					await this.performFileSync(file, stat.mtime);
					successCount++;
					hasUpdates = true;
				} else {
					skippedCount++;
				}

			} catch (error) {
				errorCount++;
				const errorMsg = error instanceof Error ? error.message : String(error);
				errors.push(`${filePath}: ${errorMsg}`);
			}
		}

		// Save settings if any files were updated (to save new timestamps)
		if (hasUpdates) {
			await this.saveSettings();
		}

		// Write errors to log file if any occurred
		if (errorCount > 0) {
			const logSummary = `\nTotal: ${successCount} succeeded, ${skippedCount} skipped, ${errorCount} failed\n`;
			errors.push(logSummary);

			try {
				fs.appendFileSync(this.logFilePath, errors.join('\n') + '\n');
			} catch (logError) {
				console.error('Failed to write error log:', logError);
			}
		}

		// Show summary
		if (errorCount === 0) {
			if (successCount === 0) {
				new Notice(`All ${skippedCount} checked files are up to date!`, 3000);
			} else {
				new Notice(`Synced ${successCount} files! (${skippedCount} unchanged)`, 5000);
			}
		} else {
			new Notice(`Synced ${successCount} files with ${errorCount} errors. Check sync-errors.log.`, 7000);
		}
	}

	/**
	 * Sync a single file to the destination.
	 * @param file - The vault file to sync.
	 * @param knownMtime - If provided (e.g. from syncFiles), use this as the recorded sync time to avoid race:
	 *        we sync the version that had this mtime; recording a later stat would wrongly skip future syncs.
	 *        If omitted (e.g. from syncCurrentFile), we stat once before reading and record that mtime.
	 */
	async performFileSync(file: TFile, knownMtime?: number) {
		let mtimeToRecord: number;

		if (knownMtime !== undefined) {
			mtimeToRecord = knownMtime;
		} else {
			const stat = await this.app.vault.adapter.stat(file.path);
			if (!stat) {
				throw new Error(`Could not get stats for file: ${file.path}`);
			}
			mtimeToRecord = stat.mtime;
		}

		// Read file content
		const content = await this.app.vault.readBinary(file);

		// Calculate destination path (maintain folder structure)
		const relativePath = file.path;
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

		// Record the mtime of the version we actually synced (no second stat to avoid race).
		this.settings.lastSyncTimes[file.path] = mtimeToRecord;
	}
}
