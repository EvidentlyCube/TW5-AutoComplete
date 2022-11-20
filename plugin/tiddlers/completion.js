/*\
title: $:/plugins/EvidentlyCube/TiddlerCompletion/completion.js
type: application/javascript
module-type: startup

Hooks the module
\*/

(function(){

    /*jslint node: false, browser: true */
    /*global $tw: false */
    "use strict";

    // Export name and synchronous status
    exports.name = "evidentlycube-tiddlercompletion";
	exports.platforms = ["browser"];
	exports.before = ["render"];
	exports.synchronous = true;

    exports.startup = function() {
        if ($tw.node) {
            return;
        }

		const manager = new $tw.EC_CompletionManager();

        require('$:/plugins/EvidentlyCube/TiddlerCompletion/edit-text-patch.js').patch(
			manager.handleKeydownEvent.bind(manager),
			manager.handleInputEvent.bind(manager),
			manager.handleBlurEvent.bind(manager)
		);


    };

})();
