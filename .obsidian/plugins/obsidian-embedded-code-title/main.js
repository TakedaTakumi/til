/*
THIS IS A GENERATED/BUNDLED FILE BY ROLLUP
if you want to view the source visit the plugins github repository
*/

'use strict';

var obsidian = require('obsidian');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

const DEFAULT_SETTINGS = {
    substitutionTokenForSpace: undefined,
    titleBackgroundColor: "#1c1c1c",
    titleFontColor: "darkgrey",
};
// Refer https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
function escapeRegExp(str) {
    return str.replace(/[.*+?^=!:${}()|[\]\/\\]/g, "\\$&");
}
class EmbeddedCodeTitlePlugin extends obsidian.Plugin {
    insertFileNamesIntoCodeBlocks(el) {
        var _a;
        const wrapperElm = el.querySelectorAll("pre").item(0);
        if (!wrapperElm) {
            return;
        }
        const settings = this.settings;
        let title;
        const codeElm = wrapperElm.querySelector("code");
        if (!codeElm) {
            return;
        }
        const classNames = codeElm.className.split(":");
        if (classNames === null || classNames === void 0 ? void 0 : classNames[0]) {
            codeElm.addClass(classNames[0]);
            title = classNames === null || classNames === void 0 ? void 0 : classNames[1];
        }
        // ---------------------------------------------------------
        // Enable to use same codes since here for Obsidian Publish
        // ---------------------------------------------------------
        if (title === "") {
            title = (_a = classNames
                .find((x) => x.startsWith("language-"))) === null || _a === void 0 ? void 0 : _a.replace("language-", "");
        }
        if (!title) {
            return;
        }
        if (settings.substitutionTokenForSpace) {
            title = title.replace(new RegExp(escapeRegExp(settings.substitutionTokenForSpace), "g"), " ");
        }
        wrapperElm.style.setProperty("position", "relative", "important");
        wrapperElm.style.setProperty("padding-top", "30px", "important");
        wrapperElm
            .querySelectorAll(".obsidian-embedded-code-title__code-block-title")
            .forEach((x) => x.remove());
        let d = document.createElement("pre");
        d.appendText(title);
        d.className = "obsidian-embedded-code-title__code-block-title";
        d.style.color = settings.titleFontColor;
        d.style.backgroundColor = settings.titleBackgroundColor;
        wrapperElm.prepend(d);
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("loading Embedded Code Title plugin");
            yield this.loadSettings();
            this.addSettingTab(new EmbeddedCodeTitleTab(this.app, this));
            this.registerMarkdownPostProcessor((el) => this.insertFileNamesIntoCodeBlocks(el));
        });
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
}
class EmbeddedCodeTitleTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        let { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl)
            .setName("Substitution token for space")
            .setDesc("The token which substitutes to space.")
            .addText((tc) => tc
            .setPlaceholder("Enter a token")
            .setValue(this.plugin.settings.substitutionTokenForSpace)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.substitutionTokenForSpace = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian.Setting(containerEl).setName("Font color of title").addText((tc) => tc
            .setPlaceholder("Enter a color")
            .setValue(this.plugin.settings.titleFontColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.titleFontColor = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian.Setting(containerEl)
            .setName("Background color of title")
            .addText((tc) => tc
            .setPlaceholder("Enter a color")
            .setValue(this.plugin.settings.titleBackgroundColor)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.titleBackgroundColor = value;
            yield this.plugin.saveSettings();
        })));
    }
}

module.exports = EmbeddedCodeTitlePlugin;


/* nosourcemap */