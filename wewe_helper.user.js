// ==UserScript==
// @name         wewe helper
// @namespace    https://github.com/cxumol/userscripts
// @version      0.1
// @description  flip pages for wewe chat
// @author       cxumol
// @match        https://wewe.t9t.io/chat/*
// @grant        none
// ==/UserScript==

// Editor: Tampermonkey v4.10 for Firefox

(function() {
    'use strict';
    function flipPage(){
        document.onkeydown = function(e) {
            var evt = e || window.event;
            var btnPrevious = document.querySelector(".previous a");
            var btnNext = document.querySelector(".next a");
            //event.preventDefault();
            switch (evt.key) {
                case "ArrowLeft": {
                    //left
                    console.log("ArrowLeft pressed, flip to previous page");
                    btnPrevious.click();
                    break;
                }
                case "ArrowRight": {
                    //right
                    console.log("ArrowRight pressed, flip to previous page");
                    btnNext.click();
                    break;
                }
            }
        };
    }
  flipPage();
})();
