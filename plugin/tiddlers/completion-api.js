/*\
title: $:/plugins/EvidentlyCube/TiddlerCompletion/completion-api.js
type: application/javascript
module-type: library

API for the modal

\*/
(function () {

	const DATA_TIDDLER_NAME = "$:/temp/TiddlerCompletion/completion-data";

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	var OPTIONS_TIDDLERS = [
		'$:/plugins/EvidentlyCube/TiddlerCompletion/Config',
		'$:/config/shortcuts/EC-TiddlerCompletion',
		'$:/config/shortcuts-linux/EC-TiddlerCompletion',
		'$:/config/shortcuts-not-linux/EC-TiddlerCompletion',
		'$:/config/shortcuts-mac/EC-TiddlerCompletion',
		'$:/config/shortcuts-not-mac/EC-TiddlerCompletion',
		'$:/config/shortcuts-windows/EC-TiddlerCompletion',
		'$:/config/shortcuts-not-windows/EC-TiddlerCompletion',
	];

	function EC_TiddlerCompletion() {
		this.isActive = false;
		this.activeState = {
			trigger: null,
			lastQuery: null,
			selectedResult: -1,
			results: [],
			callbacks: {}
		}
		this.options = {
			maxRows: 8,
			triggers: [],
			triggerTiddlers: []
		}

		this._loadOptions();
		this._updateTriggerList(this._getTriggerTiddlerList());

		document.addEventListener('keydown', this._handleGlobalKeydownCapture.bind(this), true);
		document.addEventListener('mousedown', this._handleGlobalMouseDownCapture.bind(this), true);
		$tw.wiki.addEventListener("change", this._handleChange.bind(this));
	};

	EC_TiddlerCompletion.prototype._handleGlobalKeydownCapture = function (event) {
		if (this.isActive && event.key === "Escape") {
			this.finishCompletion();
			event.stopImmediatePropagation();
			event.preventDefault();
		}
	};

	EC_TiddlerCompletion.prototype._handleGlobalMouseDownCapture = function (event) {
		if (this.isActive && event.target.classList.contains('ec_tc-link') && this.activeState.callbacks.onSelected) {
			this.activeState.callbacks.onSelected(event.target.getAttribute('data-value'));
			event.stopImmediatePropagation();
			event.preventDefault();
		}
	};

	EC_TiddlerCompletion.prototype.getMatchingTrigger = function (lastCharacter, inputType, getFragmentCallback) {
		var ignoreType = lastCharacter === null;

		for (let i = 0; i < this.options.triggers.length; i++) {
			var triggerData = this.options.triggers[i];

			if (!ignoreType && !triggerData.autoTriggerInput && inputType === 'INPUT') {
				continue;

			} else if (!ignoreType && !triggerData.autoTriggerTextArea && inputType === 'TEXTAREA') {
				continue;

			} else if (lastCharacter && triggerData.triggerLastCharacter !== lastCharacter) {
				continue;
			}

			const fragment = getFragmentCallback(triggerData.trigger.length);
			if (fragment !== triggerData.trigger) {
				continue;
			}

			return triggerData;
		}

		return null;
	}

	EC_TiddlerCompletion.prototype.startCompletion = function (trigger, position, callbacks) {
		this.isActive = true;
		this.activeState.trigger = trigger;
		this.activeState.lastQuery = null;
		this.activeState.selectedResult = 0;
		this.activeState.results = [];
		this.activeState.callbacks = callbacks || {}

		this.updateQuery("");

		const newStyle = `left: ${position.left.toFixed(4)}px; top: ${position.top.toFixed(4)}px`;

		$tw.wiki.setText(DATA_TIDDLER_NAME, 'show', null, "1");
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'style', null, newStyle);
	};

	EC_TiddlerCompletion.prototype.finishCompletion = function () {
		if (this.activeState.callbacks.onFinish) {
			this.activeState.callbacks.onFinish();
		}

		this.isActive = false;
		this.activeState.trigger = null;
		this.activeState.lastQuery = null;
		this.activeState.selectedResult = -1;
		this.activeState.results = [];

		$tw.wiki.setText(DATA_TIDDLER_NAME, 'show', null, "0");
	};

	EC_TiddlerCompletion.prototype.updateQuery = function (query) {
		if (query === this.activeState.lastQuery) {
			return;
		}

		this.activeState.lastQuery = query;
		this.activeState.selectedResult = 0;

		const results = $tw.wiki.filterTiddlers(this.activeState.trigger.filter, getVariableFauxWidget('query', query));

		this.activeState.results = results.slice(0, this.options.maxRows);
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'list', null, this.activeState.results);
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'index', null, 1);
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'has-more', null, results.length > this.options.maxRows ? 1 : 0);
	};

	EC_TiddlerCompletion.prototype.changeSelection = function (delta) {
		this.activeState.selectedResult += delta

		if (this.activeState.selectedResult < 0) {
			this.activeState.selectedResult = this.activeState.results.length - 1;
		} else if (this.activeState.selectedResult >= this.activeState.results.length) {
			this.activeState.selectedResult = 0;
		}

		$tw.wiki.setText(DATA_TIDDLER_NAME, 'index', null, this.activeState.selectedResult + 1);
	};

	EC_TiddlerCompletion.prototype.getCompletedTemplate = function (option) {
		const withReplacedOption = this.activeState.trigger.insertTemplate.replace(/\$option\$/g, option);
		const caretTokenIndex = withReplacedOption.indexOf("$caret$");
		const withRemovedCaret = withReplacedOption.replace(/\$caret\$/g, '');
		return {
			text: withRemovedCaret,
			caretIndex: caretTokenIndex !== -1
				? caretTokenIndex
				: withRemovedCaret.length
		};
	}

	EC_TiddlerCompletion.prototype.getSelected = function () {
		return this.activeState.results[this.activeState.selectedResult] || "";
	};

	EC_TiddlerCompletion.prototype.getClicked = function (event) {
		if (event.target && event.target.classList.contains('ec_tc-link')) {
			return event.target.innerText;
		}

		return null;
	};

	EC_TiddlerCompletion.prototype.isManualTrigger = function (event) {
		return $tw.keyboardManager.checkKeyDescriptors(event, this.options.manualTriggerKeyInfo);
	}

	EC_TiddlerCompletion.prototype._handleChange = function (changedTiddlers) {
		if ($tw.utils.hopArray(changedTiddlers, OPTIONS_TIDDLERS)) {
			this._loadOptions();
		}

		const newTriggerTiddlerList = this._getTriggerTiddlerList();

		if (
			$tw.utils.hopArray(changedTiddlers, newTriggerTiddlerList)
			|| $tw.utils.hopArray(changedTiddlers, this.options.triggerTiddlers)
		) {
			this._updateTriggerList(newTriggerTiddlerList);
		}
	};

	EC_TiddlerCompletion.prototype._loadOptions = function () {
		var configTiddler = $tw.wiki.getTiddler('$:/plugins/EvidentlyCube/TiddlerCompletion/Config');

		this.options.maxRows = configTiddler
			? Math.floor(parseInt(configTiddler.fields.rows)) || 8
			: 8;

		this.options.manualTriggerKeyInfo = $tw.keyboardManager.parseKeyDescriptors('((EC-TiddlerCompletion))', { wiki: this.wiki });
	}

	EC_TiddlerCompletion.prototype._getTriggerTiddlerList = function () {
		return $tw.wiki.getTiddlersWithTag("$:/tags/EC-CompletionManager/Trigger");
	};

	EC_TiddlerCompletion.prototype._updateTriggerList = function (tiddlerList) {
		this.options.triggers = [];
		this.options.triggerTiddlers = tiddlerList;

		for (var i = 0; i < tiddlerList.length; i++) {
			var title = tiddlerList[i],
				tiddlerFields = $tw.wiki.getTiddler(title).fields,
				trigger = tiddlerFields.trigger,
				filter = tiddlerFields.filter,
				insertTemplate = tiddlerFields.template;

			if (!filter || !insertTemplate || !trigger) {
				continue;
			}

			this.options.triggers.push({
				filter: tiddlerFields.filter,
				trigger: trigger,
				triggerLastCharacter: trigger.charAt(trigger.length - 1),
				insertTemplate: insertTemplate,
				autoTriggerInput: tiddlerFields['auto-trigger-input'],
				autoTriggerTextArea: tiddlerFields['auto-trigger-textarea'],
			});
		}
	};

	function getVariableFauxWidget(name, value) {
		return {
			getVariable: function (name_) {
				if (name_ === name) {
					return value;
				}
				return "";
			}
		}
	}

	exports.EC_TiddlerCompletion = EC_TiddlerCompletion;
})();
