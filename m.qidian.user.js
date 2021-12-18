// ==UserScript==
// @name         起点手机站跳转电脑版书页
// @namespace    https://github.com/cxumol/userscripts/
// @version      0.1
// @description  谷歌收录起点书, 老爱收录其手机网页版网址, 给电脑用户带来的不便, 用此脚本自动跳转
// @author       cxumol
// @match        https://m.qidian.com/book/*.html
// @icon         https://www.google.com/s2/favicons?domain=qidian.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Your code here...
    const bookNum = window.location.href.split('/')[4].split('.')[0]
    window.location.href = `https://book.qidian.com/info/${bookNum}/`
})();
