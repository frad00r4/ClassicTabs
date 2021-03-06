﻿/// <reference path="settings.ts" />
/// <reference path="chrome.d.ts" />

module manager {

	/* Types and Interfaces */

	interface CommandDefinition {
		enableSetting?: string;
		callback: Function;
	}

	/* Public Fields */

	export var history: { [key: number]: HistoryList; };
	export var currentTabId: { [key: number]: number; };
	export var currentTabIndex: { [key: number]: number; };
	export var inOrderTabId: { [key: number]: number; };

	export var ctrlDown: boolean;
	export var shiftDown: boolean;
	export var ignoreTabActivation: boolean;

	/* Private Fields */

	var SHIFT = 16;
	var CTRL = 17;

	var COMMANDS: { [key: string]: CommandDefinition } = {
		"tab_left": {
			enableSetting: 'enableTabCycle',
			callback: _cycleTabLeft,
		},
		"tab_right": {
			enableSetting: 'enableTabCycle',
			callback: _cycleTabRight,
		},
	};

	/* Public Functions */

	export function init() {
		manager.ctrlDown = false;
		manager.shiftDown = false;
		manager.ignoreTabActivation = false;

		manager.history = {};
		manager.currentTabId = {};
		manager.currentTabIndex = {};
		manager.inOrderTabId = {};

		chrome.windows.getAll(_createHistories);
		chrome.tabs.query({ active: true }, _createCurrentTabs);

		chrome.windows.onCreated.addListener(_onWindowCreated);
		chrome.windows.onRemoved.addListener(_onWindowRemoved);

		chrome.tabs.onMoved.addListener(_onTabMoved);
		chrome.tabs.onCreated.addListener(_onTabCreated);
		chrome.tabs.onRemoved.addListener(_onTabRemoved);
		chrome.tabs.onActivated.addListener(_onTabActivated);
		chrome.tabs.onDetached.addListener(_onTabDetached);
		chrome.tabs.onAttached.addListener(_onTabAttached);

		chrome.commands.onCommand.addListener(_onCommand);
		chrome.runtime.onMessage.addListener(_onMessage);
	}

	export function onInstall() {
		settings.init();
	}

	/* Private Functions */

	function _addToHistory(tab: Tab) {
		var history = manager.history[tab.windowId];
		history.insert(tab.id);

		manager.currentTabId[tab.windowId] = tab.id;
		manager.currentTabIndex[tab.windowId] = tab.index;
		manager.inOrderTabId[tab.windowId] = tab.id;
	}

	function _createCurrentTabs(tabs: Tab[]) {
		tabs.forEach((tab) => {
			manager.currentTabId[tab.windowId] = tab.id;
			manager.currentTabIndex[tab.windowId] = tab.index;
		});
	}
	
	function _createHistories(windows: BrowserWindow[]) {
		windows.forEach((window) => {
			manager.history[window.id] = new HistoryList();
		});
	}

	function _cycleTabLeft() {
		//chrome.tabs.query({ currentWindow: true, active: true }, (current?) => {
		//	if (!current) {
		//		return;
		//	}

		//	chrome.tabs.query({ windowId: current.windowId }, (tabs) => {
		//		var focusTab: Tab = null;
		//		var rightTab: Tab = null;
		//		var rightIndex = -1;

		//		// Find the next tab to the left
		//		for (var i = 0; i < tabs.length; ++i) {
		//			if (tabs[i].index === current.index - 1) {
		//				focusTab = tabs[i];
		//				break;
		//			}

		//			if (tabs[i].index > rightIndex) {
		//				rightTab = tabs[i];
		//				rightIndex = rightTab.index;
		//			}
		//		}

		//		// If no tab found, wrap to the last tab on the right
		//		if (focusTab === null) {
		//			focusTab = rightTab;
		//		}

		//		chrome.tabs.update(focusTab.id, { active: true });
		//	})
		//});
	}

	function _cycleTabRight() {
		//chrome.tabs.query({ currentWindow: true, active: true }, (current?) => {
		//	if (!current) {
		//		return;
		//	}

		//	chrome.tabs.query({ windowId: current.windowId }, (tabs) => {
		//		var focusTab: Tab = null;
		//		var leftTab: Tab = null;

		//		// Find the next tab to the right
		//		for (var i = 0; i < tabs.length; ++i) {
		//			if (tabs[i].index === current.index + 1) {
		//				focusTab = tabs[i];
		//				break;
		//			}

		//			if (tabs[i].index === 0) {
		//				leftTab = tabs[i];
		//			}
		//		}

		//		// If no tab found, wrap to the first tab on the left
		//		if (focusTab === null) {
		//			focusTab = leftTab;
		//		}

		//		chrome.tabs.update(focusTab.id, { active: true });
		//	})
		//});
	}

	function _getNextTabIndex(neighborId: number, callback: (index: number, windowId: number) => any) {
		if (neighborId === null) {
			callback(null, null);
		}

		chrome.tabs.get(neighborId, (neighbor) => {
			callback(neighbor.index + 1, neighbor.windowId);
		});
	}

	function _handleCreatedTabMovement(tab: Tab) {
		var history = manager.history[tab.windowId];
		switch (settings.onOpen) {
			case 'nextToActive':
				if (settings.openInOrder && inOrderTabId[tab.windowId] != null) {
					chrome.tabs.get(inOrderTabId[tab.windowId], (prevTab) => {
						if (tab && tab.openerTabId === history.first) {
							_moveNextToTab(tab, prevTab.id);
						} else {
							_moveNextToTab(tab, history.first);
						}
						inOrderTabId[tab.windowId] = tab.id;
					});
				} else {
					_moveNextToTab(tab, history.first);
				}
				break;

			case 'atEnd':
				_moveToEnd(tab);
				break;

			case 'otherAtEnd':
				_moveOtherToEnd(tab);
				break;
		}

		if (tab.active) {
			history.insert(tab.id);
		} else {
			history.append(tab.id);
		}
	}

	function _isSpeeddial(tab: Tab) {
		return tab.url === 'opera://startpage/';
	}

	function _moveNextToTab(tab: Tab, neighbor: Tab, callback?: (tab: Tab) => any);
	function _moveNextToTab(tab: Tab, neighborId: number, callback?: (tab: Tab) => any);
	function _moveNextToTab(tab: Tab, neighborId: any, callback?: (tab: Tab) => any) {
		if (neighborId === null) {
			return;
		}

		if (typeof(neighborId) === 'number') {
			_getNextTabIndex(neighborId, (index, windowId) => {
				if (tab.index !== index || tab.windowId !== windowId) {
					chrome.tabs.move(tab.id, { index: index, windowId: windowId }, callback);
				}
			});
		} else {
			var neighbor = <Tab>neighborId;
			if (tab.index !== neighbor.index + 1 || tab.windowId !== neighbor.windowId) {
				chrome.tabs.move(tab.id, { index: neighbor.index + 1, windowId: neighbor.windowId }, callback);
			}
		}
	}

	function _moveOtherToEnd(tab: Tab, windowId?: number, callback?: (tab: Tab) => any) {
		if (typeof(windowId) === 'undefined') {
			windowId = tab.windowId;
		}

		var history = manager.history[windowId];
		if (_isSpeeddial(tab)) {
			_moveNextToTab(tab, history.first, callback);
		} else {
			_moveToEnd(tab, windowId, callback);
		}
	}

	function _moveToEnd(tab: Tab, windowId?: number, callback?: (tab: Tab) => any) {
		if (typeof(windowId) === 'undefined') {
			windowId = tab.windowId;
		}
		chrome.tabs.move(tab.id, { index: -1, windowId: windowId }, callback);
	}

	function _moveToOpenerWindow(tab: Tab, opener: Tab) {
		var history = manager.history[opener.windowId];
		var index = -1;

		function _focus(tab: Tab) {
			chrome.tabs.update(tab.id, { active: true });
		}

		switch (settings.onOpen) {
			case 'nextToActive':
				_moveNextToTab(tab, history.first, _focus);
				break;

			case 'atEnd':
				_moveToEnd(tab, opener.windowId, _focus);
				break;

			case 'otherAtEnd':
				_moveOtherToEnd(tab, opener.windowId, _focus);
				break;
			
			case 'default':
				if (_isSpeeddial(tab)) {
					_moveToEnd(tab, opener.windowId, _focus);
				} else {
					_moveNextToTab(tab, opener, _focus);
				}
				break;
		}
	}

	function _onCommand(command: string) {
		var def = COMMANDS[command];
		if (def) {
			console.log(command, def);
			if (!('enableSetting' in def) || settings.get(def.enableSetting)) {
				def.callback.call(null);
			}
		} else {
			console.error('Unknown keyboard command: ' + command);
		}
	}

	function _onMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: Function) {
		switch (message.action) {
			case 'up':
				if (message.key === CTRL) {
					ctrlDown = false;
				} else if (message.key === SHIFT) {
					shiftDown = false;
				}
				break;

			case 'down':
				if (message.key === CTRL) {
					ctrlDown = true;
				} else if (message.key === SHIFT) {
					shiftDown = true;
				}
				break;
		}
	}
	
	function _onTabActivated(activeInfo: chrome.tabs.TabActiveInfo) {
		// Delay changing history since a new tab gets activated first
		// when a tab is being removed, then the tabRemoved event fires.
		chrome.tabs.get(activeInfo.tabId, (tab) => {
			// Ignore whichever tab gets activated right after a tab is closed
			// if we are overriding tab close behavior.
			if (ignoreTabActivation) {
				ignoreTabActivation = false;
			} else {
				_addToHistory(tab);
			}
		});
	}

	function _onTabAttached(tabId: number, attachInfo: chrome.tabs.TabAttachInfo) {
		var history = manager.history[attachInfo.newWindowId];
		history.insert(tabId);
	}

	function _onTabCreated(tab: Tab) {
		_handleCreatedTabMovement(tab);

		if (settings.preventNewWindow && shiftDown && tab.openerTabId !== undefined) {
			// If tab opened in a new window while holding Shift, move it back.
			chrome.tabs.get(tab.openerTabId, (opener) => {
				if (tab.windowId !== opener.windowId) {
					_moveToOpenerWindow(tab, opener);
				}
			});
		}

		if (settings.focusOnOpen === 'always' && !tab.active && tab.openerTabId !== undefined) {
			if (settings.exceptCtrl && ctrlDown) {
				return;
			}

			chrome.tabs.update(tab.id, { active: true });
		}
	}

	function _onTabDetached(tabId: number, detachInfo: chrome.tabs.TabDetachInfo) {
		var history = manager.history[detachInfo.oldWindowId];
		history.remove(tabId);
	}

	function _onTabMoved(tabId: number, moveInfo: chrome.tabs.TabMoveInfo) {
		// If the moved tab was active, update the currentTabIndex
		if (manager.currentTabId[moveInfo.windowId] === tabId) {
			manager.currentTabIndex[moveInfo.windowId] = moveInfo.toIndex;
		}
	}

	function _onTabRemoved(id: number, removeInfo: chrome.tabs.TabRemoveInfo) {
		var history = manager.history[removeInfo.windowId];
		var mode = settings.onClose;
		var wasActive = manager.currentTabId[removeInfo.windowId] === id || manager.currentTabId[removeInfo.windowId] === undefined;

		switch (mode) {
			case 'lastfocused':
				var newTab = history.second;
				if (wasActive && newTab) {
					chrome.tabs.update(newTab, { active: true }, (tab?) => {
						// Just in case, force this new tab to the top of the history
						if (tab) {
							_addToHistory(tab);
						}
					});
				}

				ignoreTabActivation = true;
				break;

			case 'next':
			case 'previous':
				var index = manager.currentTabIndex[removeInfo.windowId];

				if (wasActive && index !== undefined) {
					// if next tab, focus tab in the closing tab's old position.
					// if previous tab, focus the tab right before it.
					if (mode === 'previous') {
						index = Math.max(0, index - 1);
					}

					chrome.tabs.query({
						windowId: removeInfo.windowId,
						index: index,
					}, (tabs) => {
						if (tabs.length > 0) {
							chrome.tabs.update(tabs[0].id, { active: true }, (tab?) => {
								// Just in case, force this new tab to the top of the history
								if (tab) {
									_addToHistory(tab);
								}
							});
						}
					});
				}
				ignoreTabActivation = true;
				break;
		}

		history.remove(id);
	}

	function _onWindowCreated(window: BrowserWindow) {
		manager.history[window.id] = new HistoryList();

		if (!(window.id in manager.currentTabId)) {
			manager.currentTabId[window.id] = null;
		}
		if (!(window.id in manager.currentTabIndex)) {
			manager.currentTabIndex[window.id] = null;
		}
		if (!(window.id in manager.inOrderTabId)) {
			manager.inOrderTabId[window.id] = null;
		}
	}

	function _onWindowRemoved(windowId: number) {
		delete manager.history[windowId];
		delete manager.currentTabId[windowId];
		delete manager.currentTabIndex[windowId];
		delete manager.inOrderTabId[windowId];
	}

}

/* Initialization */

chrome.runtime.onInstalled.addListener(manager.onInstall);
manager.init();

/* Classes and Interfaces */

interface Tab extends chrome.tabs.Tab { }
interface BrowserWindow extends chrome.windows.Window { }

/** Structure used to save how recently a tab was focused */
class HistoryList {
	/** Returns the most recently active tab */
	get first(): number {
		var item = this._head.next;
		return (item === this._tail) ? null : item.id;
	}

	get second(): number {
		return this.item(1);
	}

	private _head: HistoryList.Node;
	private _tail: HistoryList.Node;
	private _map: { [key: number]: HistoryList.Node; };

	/* Public Functions */

	constructor () {
		this._head = new HistoryList.Node(null);
		this._tail = new HistoryList.Node(null);
		this._head.next = this._tail;
		this._tail.prev = this._head; 

		this._map = {};
	}

	public item(index: number) {
		var item = this._head.next;
		for (var i = 0; i < index && item !== this._tail; i++) {
			item = item.next;
		}
		
		return (item === this._tail) ? null : item.id;
	}

	/** 
	 * Adds a tab at the front of the list. If the tab already
	 * exists, it will be moved to the front. 
	 */
	public insert(id: number) {
		var item = this._detachOrCreateNode(id);
		var second = this._head.next;

		item.prev = this._head;
		this._head.next = item;

		item.next = second;
		second.prev = item;
	}

	/** 
	 * Adds a tab at the end of the list. If the tab already
	 * exists, it will be moved to the front.
	 */
	public append(id: number) {
		var item = this._detachOrCreateNode(id);
		var second = this._tail.prev;

		item.next = this._tail;
		this._tail.prev = item;

		item.prev = second;
		second.next = item;
	}

	/** Removes a tab from the list */
	public remove(id: number) {
		var toRemove = this._findNode(id);
		
		if (toRemove) {
			this._detachNode(toRemove);
			delete this._map[id];
		}
	}

	/** Converts the current history list to an array of tab ids */
	public toArray() {
		var list: number[] = [];
		var item = this._head.next;
		while (item !== this._tail) {
			list.push(item.id);
			item = item.next;
		}

		return list;
	}

	/* Private Functions */

	/** 
	 * Gets a node for the tab ID by either detaching an existing
	 * one or creating a new one.
	 */
	private _detachOrCreateNode(id: number) {
		var item = this._findNode(id);
		if (item) {
			this._detachNode(item);
		} else {
			item = new HistoryList.Node(id);
			this._map[id] = item;
		}
		return item;
	}

	/** Returns the node for a tab with a given ID */
	private _findNode(id: number) {
		return this._map[id];
	}

	/** Detaches a node */
	private _detachNode(node: HistoryList.Node) {
		var before = node.prev;
		var after = node.next;

		before.next = after;
		after.prev = before;

		node.prev = null;
		node.next = null;
	}
}

module HistoryList {
	export class Node {
		public prev: Node;
		public next: Node;
		public id: number;

		constructor (id: number) {
			this.prev = null;
			this.next = null;
			this.id = id;
		}
	}
}