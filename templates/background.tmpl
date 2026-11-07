/**
 * RedTerminal - Cross-Browser Background Service Worker (Manifest V3)
 * Compatible with Chromium (Chrome, Edge, Brave, Opera) and Firefox (Gecko).
 */

const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

// Listen for extension action icon click in toolbar
if (ext.action && ext.action.onClicked) {
    ext.action.onClicked.addListener(async (tab) => {
        if (!tab || !tab.id) return;

        // Skip restricted internal browser URLs
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
            return;
        }

        try {
            await ext.tabs.sendMessage(tab.id, { action: 'toggle_terminal' });
        } catch (err) {
            // If content script is not yet active on the tab, dynamically inject it
            try {
                if (ext.scripting && ext.scripting.executeScript) {
                    await ext.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                }
            } catch (injectErr) {
                console.error('RedTerminal: Script injection failed:', injectErr);
            }
        }
    });
}

// Listen for keyboard command shortcut (Alt+Shift+T)
if (ext.commands && ext.commands.onCommand) {
    ext.commands.onCommand.addListener(async (command) => {
        if (command === 'toggle-terminal') {
            const tabs = await ext.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs[0] && tabs[0].id) {
                try {
                    await ext.tabs.sendMessage(tabs[0].id, { action: 'toggle_terminal' });
                } catch (e) {
                    // Try dynamic injection if content script was not running
                    try {
                        if (ext.scripting && ext.scripting.executeScript) {
                            await ext.scripting.executeScript({
                                target: { tabId: tabs[0].id },
                                files: ['content.js']
                            });
                        }
                    } catch (injectErr) {
                        console.error('RedTerminal: Keyboard injection failed:', injectErr);
                    }
                }
            }
        }
    });
}
