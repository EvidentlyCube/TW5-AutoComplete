/*\
title: $:/plugins/EvidentlyCube/TiddlerCompletion/completion-manager.js
type: application/javascript
module-type: global

Keyboard handling utilities

\*/
(function () {

	const DATA_TIDDLER_NAME = "$:/temp/TiddlerCompletion/completion-data";

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	var widget = require("$:/core/modules/widgets/widget.js");

	function CompletionManager() {
		var self = this;

		this.completingData = {
			model: null,
			dom: null,
			startPosition: -1,
			lastQuery: null,
			selectedResult: -1,
			results: []
		}

		this.variableWidget = new widget.widget({
			type: "widget",
			children: []
		},{
			wiki: $tw.wiki,
			document: $tw.browser ? document : $tw.fakeDocument
		});

		this.triggers = [];
		this.triggerTiddlers = [];
		this.maxRows = 8;
		this.getCaretCoordinates = require('$:/plugins/EvidentlyCube/TiddlerCompletion/textarea-caret-position.js').getCaretCoordinates;
		this.manualTriggerKeyInfo = null;

		this.loadConfig();
		this.updateTriggerList(this.getTriggerTiddlerList());
		$tw.wiki.addEventListener("change", function (changes) {
			self.handleChange(changes);
		});
		document.addEventListener('keydown', this.handleGlobalKeydownEvent.bind(this), true);
		document.addEventListener('mousedown', this.handleGlobalClickEvent.bind(this), true);
	}

	CompletionManager.prototype.handleGlobalClickEvent = function(event) {
		if (this.completingData.dom && event.target && event.target.classList.contains('ec_tc-link')) {
			this.insertCompletion(event.target.innerText);
			event.preventDefault();
			event.stopPropagation();
		}
	}

	CompletionManager.prototype.handleGlobalKeydownEvent = function(event) {
		if (this.completingData.dom && event.key === 'Escape') {
			this.cancelCompletion();
			event.stopPropagation();
		}
	}
	CompletionManager.prototype.handleKeydownEvent = function(event) {
		if (!this.completingData.dom) {
			if ($tw.keyboardManager.checkKeyDescriptors(event, this.manualTriggerKeyInfo)) {
				this.tryAssigningCompletion(event.target, "", true);
				event.stopImmediatePropagation();
			}
			return;
		}

		switch(event.key) {
			case "ArrowUp":
			case "ArrowDown":
				this.changeSelectedResult(event.key === "ArrowUp" ? -1 : 1);
				event.stopImmediatePropagation();
				event.preventDefault();
				break;

			case "Enter":
				if (this.completingData.results.length === 0) {
					this.cancelCompletion();
				} else {
					this.insertCompletion(this.completingData.results[this.completingData.selectedResult - 1]);
				}
				event.stopImmediatePropagation();
				event.preventDefault();
				break;
		}
	};

	CompletionManager.prototype.handleKeyupEvent = function(event) {
		if (!this.completingData.dom) {
			return;
		}

		if (this.completingData.dom.selectionStart < this.completingData.startPosition) {
			this.cancelCompletion();
		} else {
			this.refreshSearchAtSelection(this.completingData.dom.selectionStart);
		}
	}

	CompletionManager.prototype.handleInputEvent = function(event) {
		if (this.completingData.dom && event.target !== this.completingData.dom) {
			this.cancelCompletion();
		}

		if (!event.data) {
			if (this.completingData.dom) {
				this.refreshSearchAtSelection(this.completingData.dom.selectionStart);
			}
			return;
		}

		if (!this.completingData.dom) {
			this.tryAssigningCompletion(event.target, event.data, false);
		} else {
			this.refreshSearchAtSelection(this.completingData.dom.selectionStart);
		}
	};

	CompletionManager.prototype.handleBlurEvent = function(event) {
		if (this.completingData.dom) {
			this.cancelCompletion();
		}
	}

	CompletionManager.prototype.tryAssigningCompletion = function(dom, inputData, isManualTrigger) {
		// Prevent auto triggering completion if input element has certain class
		if (dom.classList.contains('ec-tc-disabled') && !isManualTrigger) {
			return;
		}

		var self = this;
		$tw.utils.each(this.triggers, function(triggerData) {
			if (!isManualTrigger && !triggerData.autoTriggerInput && dom.tagName === 'INPUT') {
				return;
			} else if (!isManualTrigger && !triggerData.autoTriggerTextArea && dom.tagName === 'TEXTAREA') {
				return
			} else if (inputData && triggerData.triggerLastCharacter !== inputData) {
				return;
			}

			const fragment = dom.value.substr(dom.selectionStart - triggerData.trigger.length, triggerData.trigger.length);
			if (fragment !== triggerData.trigger) {
				return;
			}

			self.startCompletion(
				dom,
				triggerData,
				dom.selectionStart
			);
			return false;
		});
	}

	CompletionManager.prototype.cancelCompletion = function() {
		this.completingData.model =  null;
		this.completingData.dom = null;
		this.completingData.startPosition = -1;
		this.completingData.selectedResult = -1;
		this.completingData.lastQuery = null;
		this.completingData.results = [];
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'show', null, null);
	};

	CompletionManager.prototype.startCompletion = function(dom, template, startPosition) {
		this.completingData.model =  template;
		this.completingData.dom = dom;
		this.completingData.startPosition = startPosition;
		this.completingData.selectedResult = 1;
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'show', null, "1");

		this.refreshSearch("");
		this.positionCompletionModal(this.completingData.dom.selectionStart);
	}

	CompletionManager.prototype.insertCompletion = function(tiddler) {
		const sliceStart = this.completingData.startPosition - this.completingData.model.trigger.length;
		const sliceEnd = this.completingData.dom.selectionStart;
		const replacement = this.completingData.model.insertTemplate.replace(/\$option\$/g, tiddler);
		const caretTokenIndex = replacement.indexOf("$caret$");
		const caretIndex = caretTokenIndex !== -1 ? caretTokenIndex : replacement.length;

		this.completingData.dom.selectionStart = sliceStart;
		this.completingData.dom.selectionEnd = sliceEnd;
		if (this.completingData.dom.getRootNode().execCommand) {
			this.completingData.dom.getRootNode().execCommand("insertText", false, replacement.replace(/\$caret\$/g, ''));
		} else {
			this.completingData.dom.value = this.completingData.dom.value.substr(0, sliceStart)
				+ replacement.replace(/\${caret}/g, '')
				+ this.completingData.dom.value.substr(sliceEnd);

		}
		this.completingData.dom.selectionStart = caretIndex + sliceStart;
		this.completingData.dom.selectionEnd = caretIndex + sliceStart;
		this.cancelCompletion();
	}

	CompletionManager.prototype.changeSelectedResult = function(delta) {
		this.completingData.selectedResult += delta;

		if (this.completingData.selectedResult < 1) {
			this.completingData.selectedResult += this.completingData.results.length;
		} else if (this.completingData.selectedResult > this.completingData.results.length) {
			this.completingData.selectedResult = 1;
		}

		$tw.wiki.setText(DATA_TIDDLER_NAME, 'index', null, this.completingData.selectedResult);
	}

	CompletionManager.prototype.refreshSearchAtSelection = function(selectionPos) {
		const query = this.completingData.dom.value.substring(this.completingData.startPosition, selectionPos);

		this.refreshSearch(query);
	}

	CompletionManager.prototype.refreshSearch = function(query) {
		if (query === this.completingData.lastQuery) {
			return;
		}
		this.completingData.lastQuery = query;
		const filter = this.completingData.model.filter;
		this.variableWidget.setVariable('query', query);

		this.completingData.selectedResult = 1;
		const results = $tw.wiki.filterTiddlers(filter, {getVariable: function(name) {
			if (name === "query") {
				return query;
			}
			return "";
		}});
		this.completingData.results = results.slice(0, this.maxRows);
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'list', null, this.completingData.results);
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'index', null, this.completingData.selectedResult);
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'has-more', null, results.length > this.maxRows ? 1 : 0);
	}

	CompletionManager.prototype.positionCompletionModal = function(selectionStart) {
		const baseCoords = this.completingData.dom.getBoundingClientRect();
		const coords = this.getCaretCoordinates(this.completingData.dom, selectionStart);
		const iframeCoords = this.getIframeOffset(this.completingData.dom);

		const newStyle = [
			`left: ${(baseCoords.left + coords.left + iframeCoords.left).toFixed(4)}px`,
			`top: ${(baseCoords.top + coords.top + coords.height + iframeCoords.top + window.scrollY).toFixed(4)}px`
		].join(";");

		$tw.wiki.setText(DATA_TIDDLER_NAME, 'style', null, newStyle);
	}

	CompletionManager.prototype.getIframeOffset = function(dom) {
		const root = dom.getRootNode();

		if (root !== document) {
			const parentDocument = root.defaultView.parent.document;
			const iframes = parentDocument.querySelectorAll('iframe');
			for (var i = 0; i < iframes.length; i++) {
				const iframe = iframes[i];

				if (iframe.contentDocument !== root) {
					continue;
				}

				return iframe.getBoundingClientRect();
			}
		}

		return {top: 0, left: 0};
	}

	CompletionManager.prototype.getTriggerTiddlerList = function () {
		return $tw.wiki.getTiddlersWithTag("$:/tags/EC-CompletionManager/Trigger");
	};

	CompletionManager.prototype.updateTriggerList = function (tiddlerList) {
		this.triggers = [];
		this.triggerTiddlers = tiddlerList;
		for (var i = 0; i < tiddlerList.length; i++) {
			var title = tiddlerList[i],
				tiddlerFields = $tw.wiki.getTiddler(title).fields,
				trigger = tiddlerFields.trigger,
				filter = tiddlerFields.filter,
				insertTemplate = tiddlerFields.template;

			if (!filter || !insertTemplate || !trigger) {
				continue;
			}

			this.triggers.push({
				filter: tiddlerFields.filter,
				trigger: trigger,
				triggerLastCharacter: trigger.charAt(trigger.length - 1),
				insertTemplate: insertTemplate,
				autoTriggerInput: tiddlerFields['auto-trigger-input'],
				autoTriggerTextArea: tiddlerFields['auto-trigger-textarea'],
			});
		}
	};

	CompletionManager.prototype.loadConfig = function() {
		var configTiddler = $tw.wiki.getTiddler('$:/plugins/EvidentlyCube/TiddlerCompletion/Config');

		if (configTiddler) {
			this.maxRows = Math.floor(parseInt(configTiddler.fields.rows)) || 8;
		} else {
			this.maxRows = 8;
		}

		this.manualTriggerKeyInfo = $tw.keyboardManager.parseKeyDescriptors('((EC-TiddlerCompletion))',{
			wiki: this.wiki
		});
	}

	var CONFIG_TIDDLERS = [
		'$:/plugins/EvidentlyCube/TiddlerCompletion/Config',
		'$:/config/shortcuts/EC-TiddlerCompletion',
		'$:/config/shortcuts-linux/EC-TiddlerCompletion',
		'$:/config/shortcuts-not-linux/EC-TiddlerCompletion',
		'$:/config/shortcuts-mac/EC-TiddlerCompletion',
		'$:/config/shortcuts-not-mac/EC-TiddlerCompletion',
		'$:/config/shortcuts-windows/EC-TiddlerCompletion',
		'$:/config/shortcuts-not-windows/EC-TiddlerCompletion',
	];

	CompletionManager.prototype.handleChange = function (changedTiddlers) {
		if ($tw.utils.hopArray(changedTiddlers,CONFIG_TIDDLERS)) {
			this.loadConfig();
		}
		const newTriggerTiddlerList = this.getTriggerTiddlerList();

		if ($tw.utils.hopArray(changedTiddlers, newTriggerTiddlerList) || $tw.utils.hopArray(changedTiddlers, this.triggerTiddlers)) {
			this.updateTriggerList(newTriggerTiddlerList);
		}
	};

	exports.EC_CompletionManager = CompletionManager;

})();
