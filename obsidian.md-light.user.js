// ==UserScript==
// @name         Obsidian.md Light
// @namespace    https://github.com/cxumol/userscripts
// @version      0.1
// @description  Light theme for obsidian.md website; Unfortuneately not working for it's Discourse forum.
// @author       cxumol
// @match        https://obsidian.md/*
// @icon         https://www.google.com/s2/favicons?domain=obsidian.md
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let body = document.getElementsByTagName('body')[0];
    body.removeClass('theme-dark');
    body.addClass('theme-light');
})();
