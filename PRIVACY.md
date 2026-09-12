# ClickScribe Privacy Policy

**Last updated: September 12, 2026**

ClickScribe is a Chrome extension that captures a screenshot each time you click an interactive element on a webpage while recording is active, and lets you export the captured screenshots as a Word document or a ZIP archive.

## Summary

**ClickScribe collects no data and makes no network requests.** Everything the extension captures stays on your own device, inside your own browser, until you choose to export or delete it.

## What is stored, and where

While recording, ClickScribe stores the following locally in your browser via Chrome's `storage` API (`chrome.storage.local`):

- Screenshot images (PNG, captured from the visible tab)
- Metadata about each click: the page URL and title, the click coordinates, a timestamp, and the tag name of the clicked element
- Your extension preferences (click-highlight style, screenshot frame style, and the "skip empty-space clicks" setting)

This data never leaves your device. It is not sent to the developer of ClickScribe, to any analytics or advertising service, or to any third party or remote server. The extension has no backend and performs no network requests of any kind.

## How the data is used

The stored screenshots and settings exist solely so the extension can display them back to you in its popup and let you export them, on demand, as:

- A Word-compatible `.doc` file containing the captured screenshots, or
- A `.zip` archive of the screenshots as sequentially numbered PNG files

You control when recording starts and stops, and you can clear all captured screenshots at any time using the "Clear screenshots" button in the popup.

## Where exported files go

When you click "Download as Word Document" or "Download as ZIP", ClickScribe uses Chrome's `downloads` API to save the file to your computer's normal downloads location — the same as any file you download from a website. Nothing is uploaded anywhere. The file only leaves your device if you subsequently choose to share it yourself.

## Permissions and why they're needed

| Permission | Why ClickScribe needs it |
|---|---|
| `activeTab` / `tabs` | To identify the current tab and capture a screenshot of it when you click. |
| `<all_urls>` (host permission) | The content script that detects clicks needs to run on whichever page you choose to record — since you may want to record on any website, not just a fixed list. |
| `storage` / `unlimitedStorage` | To save your recording session and preferences locally. `unlimitedStorage` is needed because a recording session's screenshots can add up to several megabytes. |
| `downloads` | To save the exported Word document or ZIP file to your computer when you use the export buttons. |

## Data retention and deletion

Captured screenshots and settings remain in local browser storage until you clear them via the popup or uninstall the extension. Uninstalling ClickScribe removes all of its locally stored data along with it.

## Children's privacy

ClickScribe does not knowingly collect information from anyone, including children, because it does not collect or transmit information at all.

## Changes to this policy

If ClickScribe's functionality changes in a way that affects this policy, this document will be updated and the "Last updated" date above will reflect the change.

## Contact

Questions about this policy or the extension can be raised via [GitHub Issues](https://github.com/SaiKillada/ClickScribe/issues).
